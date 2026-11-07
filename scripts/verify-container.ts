import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { SecureClient } from 'tinfoil';
import { DEMO_ALIAS, DEMO_CONTEXT, DEMO_EVIDENCE, INVOICE_TEXT } from '../src/shared/contracts';
import type { DeskSnapshot, InferenceVerification, Receipt, Submission } from '../src/shared/contracts';

// Uses only client-generated capabilities. No API key, .env loading, or server secret is needed.
// EHBP works in browsers; Node cannot establish that browser CORS or UI routing also works.
const usage = `Verify a deployed Witness Desk using synthetic evidence only.

  node --import tsx scripts/verify-container.ts \\
    --enclave-url https://YOUR-ENCLAVE-HOST \\
    --config-repo OWNER/PUBLIC-CONFIG-REPO

Environment alternatives: TINFOIL_CONTAINER_URL and TINFOIL_CONFIG_REPO.
Use a Node version supported by the installed Tinfoil SDK (currently 24.22.1+).
--help makes no network requests. Evidence is saved under ignored artifacts/container-verification/.
Successful verification resets only the session created by this script.
`;

class VerificationFailure extends Error {
  constructor(readonly code: string, readonly httpStatus?: number) { super(code); }
}

function requireCheck(condition: unknown, code: string): asserts condition {
  if (!condition) throw new VerificationFailure(code);
}

function parseOptions() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) return null;
  const options: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    requireCheck(['--enclave-url', '--config-repo'].includes(args[index]) && args[index + 1] && !args[index + 1].startsWith('--'), 'invalid-arguments');
    options[args[index]] = args[index + 1];
  }
  const suppliedURL = options['--enclave-url'] || process.env.TINFOIL_CONTAINER_URL;
  const configRepo = options['--config-repo'] || process.env.TINFOIL_CONFIG_REPO;
  requireCheck(suppliedURL && configRepo, 'missing-enclave-url-or-config-repo');
  let url: URL;
  try { url = new URL(suppliedURL); } catch { throw new VerificationFailure('invalid-enclave-url'); }
  requireCheck(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/', 'enclave-must-be-an-https-origin');
  requireCheck(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(configRepo), 'config-repo-must-be-owner-slash-repository');
  return { enclaveURL: url.origin, configRepo };
}

type SafeVerification = Pick<InferenceVerification, 'securityVerified' | 'verifiedAt' | 'configRepo' | 'enclaveHost' | 'releaseDigest' | 'codeFingerprint' | 'enclaveFingerprint'>;

function safeVerification(document: {
  securityVerified: boolean; verifiedAt?: string; configRepo: string; enclaveHost: string;
  releaseDigest: string; codeFingerprint: string; enclaveFingerprint: string;
}): SafeVerification {
  requireCheck(document.securityVerified === true, 'attestation-not-verified');
  // Select only public verification metadata, never keys, request bodies, or the full document.
  const field = (value: string) => {
    requireCheck(typeof value === 'string' && value.length > 0 && value.length <= 1024 && !/[\r\n\u0000]/.test(value), 'invalid-verification-metadata');
    return value;
  };
  return {
    securityVerified: true,
    verifiedAt: field(document.verifiedAt || new Date().toISOString()),
    configRepo: field(document.configRepo), enclaveHost: field(document.enclaveHost),
    releaseDigest: field(document.releaseDigest), codeFingerprint: field(document.codeFingerprint),
    enclaveFingerprint: field(document.enclaveFingerprint),
  };
}

async function bounded<T>(operation: Promise<T>, milliseconds: number, failureCode: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new VerificationFailure(failureCode)), milliseconds);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

type EvidenceReport = {
  schemaVersion: 1;
  startedAt: string;
  finishedAt?: string;
  outcome: 'running' | 'passed' | 'failed';
  nodeVersion: string;
  target?: { enclaveOrigin: string; configRepo: string };
  containerVerification?: SafeVerification;
  inferenceVerification?: SafeVerification;
  transport?: { mode: 'ehbp'; attestedHpkeAvailable: true; browserFlow: 'not-exercised' };
  checks: Record<string, boolean | string | number>;
  cleanup: { attempted: boolean; resetSucceeded: boolean; originalSessionInvalidated: boolean; replacementSessionEmpty: boolean };
  failure?: { stage: string; code: string; httpStatus?: number };
};

async function verify(options: NonNullable<ReturnType<typeof parseOptions>>, report: EvidenceReport) {
  let stage = 'attestation';
  report.target = { enclaveOrigin: options.enclaveURL, configRepo: options.configRepo };
  // SecureClient's default base URL ends in /v1/. This application exposes /api/* instead.
  // An explicit baseURL plus absolute request URLs avoids relative-URL differences in Node.
  const client = new SecureClient({
    enclaveURL: options.enclaveURL, baseURL: options.enclaveURL,
    configRepo: options.configRepo, transport: 'ehbp', userCacheSecret: randomBytes(32).toString('hex'),
  });

  const request = async (route: string, body: unknown, timeoutMs = 15_000) => bounded(client.fetch(new URL(route, options.enclaveURL).href, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  }), timeoutMs, 'request-timeout');

  const json = async <T>(route: string, body: unknown, timeoutMs = 15_000): Promise<T> => {
    const response = await request(route, body, timeoutMs);
    if (!response.ok) {
      await response.body?.cancel();
      throw new VerificationFailure('application-request-rejected', response.status);
    }
    try { return await bounded(response.json() as Promise<T>, timeoutMs, 'response-timeout'); }
    catch (error) { if (error instanceof VerificationFailure) throw error; throw new VerificationFailure('invalid-json-response'); }
  };

  try {
    await bounded(client.ready(), 45_000, 'attestation-timeout');
    const document = client.getVerificationDocument();
    report.containerVerification = safeVerification(document);
    requireCheck(document.configRepo === options.configRepo, 'unexpected-configuration-repository');
    requireCheck(typeof document.hpkePublicKey === 'string' && document.hpkePublicKey.length > 0, 'attested-hpke-key-required-for-browser-transport');
    requireCheck(client.getBaseURL() === options.enclaveURL, 'unexpected-client-base-url');
    report.transport = { mode: 'ehbp', attestedHpkeAvailable: true, browserFlow: 'not-exercised' };

    stage = 'create-isolated-session';
    const readerSecret = randomBytes(48).toString('hex');
    const created = await json<{ sessionId: string; senderCapability: string }>('/api/sessions', { readerSecret });
    requireCheck(typeof created.sessionId === 'string' && created.sessionId.length > 0 && typeof created.senderCapability === 'string' && created.senderCapability.length > 0, 'invalid-session-response');
    const reader = { sessionId: created.sessionId, readerSecret };

    stage = 'sender-read-isolation';
    const denied = await request('/api/desk/read', { sessionId: created.sessionId, readerSecret: created.senderCapability });
    await denied.body?.cancel();
    requireCheck(denied.status === 403, 'sender-was-not-rejected-as-reader');
    report.checks.senderReadRejected = true;

    stage = 'synthetic-submission';
    const submissionId = randomUUID();
    const receipt = await json<Receipt>('/api/submit', {
      sessionId: created.sessionId, senderCapability: created.senderCapability, submissionId,
      tip: { contributorAlias: DEMO_ALIAS, evidenceText: DEMO_EVIDENCE, contextNote: DEMO_CONTEXT },
    });
    requireCheck(receipt.submissionId === submissionId && receipt.state === 'received', 'submission-receipt-invalid');

    stage = 'wait-for-analysis';
    const deadline = Date.now() + 150_000;
    let snapshot: DeskSnapshot | undefined;
    let submission: Submission | undefined;
    while (Date.now() < deadline) {
      // Both fetch and JSON decoding share the remaining polling deadline.
      snapshot = await bounded(json<DeskSnapshot>('/api/desk/read', reader, Math.max(1, Math.min(15_000, deadline - Date.now()))), Math.max(1, deadline - Date.now()), 'analysis-poll-deadline');
      requireCheck(Array.isArray(snapshot.submissions), 'invalid-desk-snapshot');
      submission = snapshot.submissions.find(item => item.id === submissionId);
      requireCheck(submission, 'submitted-record-missing');
      if (submission.state === 'ready') break;
      requireCheck(submission.state !== 'failed', 'hosted-analysis-failed');
      await sleep(Math.min(1500, Math.max(0, deadline - Date.now())));
    }
    requireCheck(snapshot && submission?.state === 'ready' && submission.analysis, 'analysis-did-not-complete-within-150-seconds');

    stage = 'validate-evidence-and-inference';
    const analysis = submission.analysis;
    requireCheck(snapshot.status?.mode === 'tinfoil-container', 'application-not-in-container-mode');
    requireCheck(snapshot.status.analysisProvider === 'tinfoil' && analysis.provider === 'tinfoil', 'analysis-did-not-use-tinfoil');
    requireCheck(analysis.kind === 'possible_overpayment' && analysis.invoiceAmount === 120000 && analysis.paymentAmount === 350000 && analysis.difference === 230000, 'incorrect-supported-amount-comparison');
    requireCheck(Array.isArray(analysis.citations) && analysis.citations.some(item => item.documentId === 'invoice-inv204' && item.quote === INVOICE_TEXT) && analysis.citations.some(item => item.documentId === 'submitted-payment' && item.quote === DEMO_EVIDENCE), 'source-citations-do-not-match-submitted-records');
    requireCheck(analysis.verification?.securityVerified === true, 'hosted-inference-verification-missing');
    report.inferenceVerification = safeVerification(analysis.verification);
    report.checks.amountComparisonVerified = true;
    report.checks.sourceCitationsVerified = true;
    report.checks.analysisProvider = analysis.provider;
    report.checks.analysisModel = analysis.model;
    report.checks.analysisDurationMs = analysis.durationMs;

    stage = 'validate-darkbloom-graph';
    requireCheck(Array.isArray(snapshot.recipients) && snapshot.recipients.length > 0, 'recipient-profiles-missing');
    requireCheck(snapshot.recipients.every(profile => profile.preparationProvider === 'darkbloom'), 'recipient-profiles-not-prepared-by-darkbloom');
    const sourceIds = new Set<string>();
    for (const profile of snapshot.recipients) {
      requireCheck(profile.supportingCitations.length > 0 && profile.sources.length > 0, 'recipient-source-provenance-missing');
      for (const citation of profile.supportingCitations) requireCheck(profile.sources.some(source => source.id === citation.documentId && source.text.includes(citation.quote)), 'recipient-citation-not-backed-by-source');
      for (const source of profile.sources) sourceIds.add(source.id);
    }
    const nodes = new Set(snapshot.graph.nodes.map(node => node.id));
    requireCheck(nodes.size > 0 && snapshot.graph.edges.length > 0 && snapshot.recipients.every(profile => nodes.has(profile.id)), 'recipient-graph-incomplete');
    requireCheck(snapshot.graph.edges.every(edge => nodes.has(edge.source) && nodes.has(edge.target) && !!edge.sourceDocumentId && sourceIds.has(edge.sourceDocumentId)), 'graph-edge-provenance-invalid');
    requireCheck(Array.isArray(analysis.recipientIds) && analysis.recipientIds.length > 0 && analysis.recipientIds.includes('maya-chen'), 'expected-cindy-recipient-not-selected');
    requireCheck(analysis.recipientIds.every(id => snapshot!.recipients.some(profile => profile.id === id)), 'analysis-selected-unknown-recipient');
    report.checks.expectedRecipientSelected = true;
    report.checks.darkbloomProfileProvenanceVerified = true;
    report.checks.recipientProfileCount = snapshot.recipients.length;
    report.checks.graphNodeCount = nodes.size;
    report.checks.graphEdgeCount = snapshot.graph.edges.length;

    stage = 'reset-own-session';
    report.cleanup.attempted = true;
    const replacementReader = randomBytes(48).toString('hex');
    const replacement = await json<{ sessionId: string; senderCapability: string }>('/api/desk/reset', { ...reader, newReaderSecret: replacementReader });
    requireCheck(typeof replacement.sessionId === 'string' && replacement.sessionId !== created.sessionId, 'reset-did-not-rotate-session');
    report.cleanup.resetSucceeded = true;
    const expired = await request('/api/desk/read', reader);
    await expired.body?.cancel();
    requireCheck(expired.status === 410, 'old-session-not-invalidated');
    report.cleanup.originalSessionInvalidated = true;
    const empty = await json<DeskSnapshot>('/api/desk/read', { sessionId: replacement.sessionId, readerSecret: replacementReader });
    requireCheck(empty.submissions.length === 0, 'replacement-session-not-empty');
    // Reset creates an empty replacement; there is currently no delete-session endpoint.
    report.cleanup.replacementSessionEmpty = true;
    report.outcome = 'passed';
  } catch (error) {
    report.outcome = 'failed';
    report.failure = {
      stage, code: error instanceof VerificationFailure ? error.code : 'verification-or-request-failed',
      ...(error instanceof VerificationFailure && error.httpStatus ? { httpStatus: error.httpStatus } : {}),
    };
  }
}

async function main() {
  let options: ReturnType<typeof parseOptions>;
  try { options = parseOptions(); }
  catch (error) {
    process.stderr.write(`${error instanceof VerificationFailure ? error.code : 'invalid-configuration'}\n${usage}`);
    return 2;
  }
  if (!options) { process.stdout.write(usage); return 0; }
  const report: EvidenceReport = {
    schemaVersion: 1, startedAt: new Date().toISOString(), outcome: 'running', nodeVersion: process.version,
    checks: {}, cleanup: { attempted: false, resetSucceeded: false, originalSessionInvalidated: false, replacementSessionEmpty: false },
  };
  // Provider diagnostics can include response details. Emit only our allowlisted report.
  console.log = console.info = console.warn = console.error = () => {};
  await verify(options, report);
  report.finishedAt = new Date().toISOString();
  const directory = fileURLToPath(new URL('../artifacts/container-verification/', import.meta.url));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filename = `verify-${report.startedAt.replace(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}.json`;
  const evidenceFile = directory + filename;
  await writeFile(evidenceFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  process.stdout.write(JSON.stringify({ outcome: report.outcome, evidenceFile, ...(report.failure ? { failure: report.failure } : {}) }) + '\n');
  return report.outcome === 'passed' ? 0 : 1;
}

main().then(code => process.exit(code)).catch(() => {
  // Never dump an exception object: it may contain remote response or request content.
  process.stderr.write('Verifier could not finish or save its sanitized evidence.\n');
  process.exit(1);
});
