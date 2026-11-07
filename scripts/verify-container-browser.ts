import { randomBytes } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Browser, BrowserContext, FrameLocator, Page } from '@playwright/test';
import { DEMO_CONTEXT, DEMO_EVIDENCE, INVOICE_TEXT } from '../src/shared/contracts';

const usage = `Exercise the deployed Witness Desk production UI with fictional evidence.

  node --import tsx scripts/verify-container-browser.ts \\
    --enclave-url https://YOUR-ENCLAVE-HOST \\
    --config-repo OWNER/PUBLIC-CONFIG-REPO

Environment alternatives: TINFOIL_CONTAINER_URL and TINFOIL_CONFIG_REPO.
Requires installed Playwright Chromium and the repository's supported Node version.
--help makes no network requests and does not launch a browser.

This uses /preview, the production phone/desk UI, and the application's normal
verified client. No source-module imports, provider stubs, TLS exceptions, or
attestation bypasses are injected into the browser. Analysis must use Tinfoil.
The bootstrap check only checks configuration; it is not attestation evidence.
Use scripts/verify-container.ts separately to export a verification document.

Screenshots, the downloaded synthetic case brief, and a sanitized result go to
ignored artifacts/container-browser/<run>/. Only this run's fresh desk is reset.
No browser storage, traces, network bodies, or raw error messages are recorded.
`;

class BrowserVerificationFailure extends Error {
  constructor(readonly code: string) { super(code); }
}

function requireCheck(condition: unknown, code: string): asserts condition {
  if (!condition) throw new BrowserVerificationFailure(code);
}

function parseOptions() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) return null;
  const flags: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    requireCheck(['--enclave-url', '--config-repo'].includes(key) && args[index + 1] && !args[index + 1].startsWith('--') && !flags[key], 'invalid-arguments');
    flags[key] = args[index + 1];
  }
  const suppliedURL = flags['--enclave-url'] || process.env.TINFOIL_CONTAINER_URL;
  const configRepo = flags['--config-repo'] || process.env.TINFOIL_CONFIG_REPO;
  requireCheck(suppliedURL && configRepo, 'missing-enclave-url-or-config-repo');
  let url: URL;
  try { url = new URL(suppliedURL); } catch { throw new BrowserVerificationFailure('invalid-enclave-url'); }
  requireCheck(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/', 'enclave-must-be-an-https-origin');
  requireCheck(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(configRepo), 'config-repo-must-be-owner-slash-repository');
  return { enclaveOrigin: url.origin, configRepo };
}

type Report = {
  schemaVersion: 1;
  startedAt: string;
  finishedAt?: string;
  outcome: 'running' | 'passed' | 'failed';
  target: { enclaveOrigin: string; configRepo: string };
  scope: {
    browser: 'headless-chromium';
    interface: 'production-preview';
    evidence: 'fictional-cindy-payment';
    bootstrap: 'configuration-check-only-not-attestation';
    attestationDocument: 'not-exported-by-this-browser-check';
  };
  checks: Record<string, boolean>;
  artifacts: string[];
  cleanup: { attempted: boolean; freshDeskReset: boolean };
  failure?: { stage: string; code: string };
};

async function verify(options: NonNullable<ReturnType<typeof parseOptions>>, report: Report, directory: string) {
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let phone: FrameLocator | undefined;
  let desk: FrameLocator | undefined;
  let stage = 'launch-browser';
  let ownsFreshDesk = false;
  let blockedInsecureRequest = false;

  async function screenshot(filename: string) {
    if (!page || page.isClosed()) return;
    // Error text and pairing UI can contain URLs or capabilities. Never photograph them.
    const masks = [page.locator('.app-loading'), page.locator('[role="alert"]')];
    if (phone) masks.push(phone.locator('[role="alert"]'));
    if (desk) masks.push(desk.locator('[role="alert"], .desk-modal-backdrop'));
    await page.screenshot({ path: directory + filename, fullPage: true, mask: masks, timeout: 15_000 });
    await chmod(directory + filename, 0o600);
    report.artifacts.push(filename);
  }

  async function resetFreshDesk() {
    if (!ownsFreshDesk || !page || page.isClosed() || !desk) return;
    report.cleanup.attempted = true;
    const activePage = page;
    const confirm = async (dialog: import('@playwright/test').Dialog) => {
      if (dialog.type() === 'confirm' && dialog.message() === 'Clear this demo desk and rotate the phone submission link?') await dialog.accept();
      else await dialog.dismiss();
    };
    activePage.on('dialog', confirm);
    try {
      await desk.getByRole('button', { name: 'Reset demo', exact: true }).click({ timeout: 15_000 });
      const { expect } = await import('@playwright/test');
      await expect(desk.getByRole('heading', { name: 'No evidence yet.', exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(desk.locator('.desk-inbox-card')).toHaveCount(0);
      await expect(desk.getByText('Desk connected', { exact: true })).toBeVisible();
      report.cleanup.freshDeskReset = true;
    } catch { /* Report cleanup outcome without disclosing remote error content. */ }
    finally { activePage.off('dialog', confirm); }
  }

  try {
    const { chromium, expect } = await import('@playwright/test');
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width: 1920, height: 1200 }, acceptDownloads: true,
      ignoreHTTPSErrors: false, bypassCSP: false, serviceWorkers: 'block',
    });
    context.setDefaultTimeout(20_000);
    // This is only a fail-closed insecure-network guard. HTTPS requests are never mocked.
    await context.route(/^http:\/\//, async route => {
      blockedInsecureRequest = true;
      await route.abort('blockedbyclient');
    });
    await context.routeWebSocket(/^ws:\/\//, socket => {
      blockedInsecureRequest = true;
      socket.close({ code: 1008, reason: 'HTTPS required' });
    });

    stage = 'check-bootstrap-configuration';
    const response = await context.request.get(`${options.enclaveOrigin}/api/bootstrap`, { maxRedirects: 0, timeout: 20_000 });
    requireCheck(response.status() === 200, 'bootstrap-not-available-without-redirect');
    let bootstrap: Record<string, unknown>;
    try { bootstrap = await response.json(); } catch { throw new BrowserVerificationFailure('bootstrap-json-invalid'); }
    requireCheck(bootstrap && bootstrap.mode === 'tinfoil-container', 'bootstrap-not-in-container-mode');
    requireCheck(typeof bootstrap.enclaveURL === 'string' && typeof bootstrap.configRepo === 'string', 'bootstrap-configuration-incomplete');
    let configured: URL;
    try { configured = new URL(bootstrap.enclaveURL); } catch { throw new BrowserVerificationFailure('bootstrap-enclave-url-invalid'); }
    requireCheck(configured.protocol === 'https:' && configured.origin === options.enclaveOrigin && configured.pathname === '/' && !configured.username && !configured.password && !configured.search && !configured.hash, 'bootstrap-enclave-origin-mismatch');
    requireCheck(bootstrap.configRepo === options.configRepo, 'bootstrap-configuration-repository-mismatch');
    report.checks.expectedBootstrapConfiguration = true;

    stage = 'open-production-preview';
    page = await context.newPage();
    await page.goto(`${options.enclaveOrigin}/preview`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    requireCheck(new URL(page.url()).origin === options.enclaveOrigin && new URL(page.url()).pathname === '/preview', 'preview-redirected-away-from-expected-page');
    phone = page.frameLocator('.preview-phone iframe');
    desk = page.frameLocator('.preview-desk iframe');
    await expect(phone.getByRole('heading', { name: 'What are you witnessing?', exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(desk.getByText('Desk connected', { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(desk.locator('.desk-inbox-card')).toHaveCount(0);
    ownsFreshDesk = true;
    report.checks.freshProductionPreviewConnected = true;

    stage = 'compose-and-review-synthetic-tip';
    await phone.getByRole('textbox', { name: 'Evidence', exact: true }).fill(DEMO_EVIDENCE);
    await phone.getByRole('textbox', { name: /^Context\b/ }).fill(DEMO_CONTEXT);
    await phone.getByRole('button', { name: 'Review', exact: true }).click();
    await expect(phone.locator('.contributor-document pre')).toHaveText(DEMO_EVIDENCE);
    await expect(phone.locator('.contributor-review-context')).toContainText(DEMO_CONTEXT);
    await screenshot('01-phone-review.png');
    await phone.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(phone.getByRole('heading', { name: 'Received', exact: true })).toBeVisible({ timeout: 45_000 });
    report.checks.phoneReviewAndReceipt = true;

    stage = 'wait-for-original-desk-analysis';
    const deadline = Date.now() + 150_000;
    let ready = false;
    while (Date.now() < deadline) {
      const states = await desk.locator('.desk-inbox-card .desk-state').allTextContents();
      requireCheck(!states.includes('Needs attention'), 'original-desk-analysis-failed');
      if (states.length === 1 && states[0] === 'Ready to review') { ready = true; break; }
      await new Promise(resolve => setTimeout(resolve, Math.min(1_000, Math.max(0, deadline - Date.now()))));
    }
    requireCheck(ready, 'original-analysis-did-not-complete-within-150-seconds');
    await expect(desk.locator('.desk-inbox-card')).toHaveCount(1);
    await expect(desk.locator('.desk-amount-grid strong')).toHaveText(['$120,000', '$350,000', '$230,000']);
    const originalDetails = desk.locator('.desk-finding details');
    await originalDetails.locator('summary').click();
    await expect(originalDetails.locator('p').first()).toHaveText(/^Tinfoil\s*·\s*\S/);
    await desk.locator('.desk-original summary').click();
    await expect(desk.locator('.desk-original pre')).toHaveText(DEMO_EVIDENCE);
    report.checks.originalAnalysisUsesTinfoil = true;
    report.checks.expectedAmountsAndOriginalText = true;
    await screenshot('02-original-tinfoil-analysis.png');

    stage = 'inspect-source-quotes';
    await expect(desk.locator('.desk-citations .desk-citation')).toHaveCount(2);
    for (const [index, source] of [INVOICE_TEXT, DEMO_EVIDENCE].entries()) {
      const citation = desk.locator('.desk-citations .desk-citation').nth(index);
      await expect(citation.locator('blockquote')).toHaveText(source);
      await citation.getByRole('button').click();
      const inspector = desk.getByRole('dialog', { name: 'Source inspector', exact: true });
      await expect(inspector).toBeVisible();
      await expect(inspector.locator('.desk-inspector-quote blockquote')).toHaveText(source);
      await expect(inspector.locator('.desk-inspector-document pre')).toHaveText(source);
      await screenshot(index === 0 ? '03-invoice-source.png' : '04-payment-source.png');
      await inspector.getByRole('button', { name: 'Close source inspector', exact: true }).click();
    }
    report.checks.sourceQuoteInspectorsMatchEvidence = true;

    stage = 'inspect-recommended-recipient';
    const maya = desk.locator('.desk-recipient-panel .desk-profile.is-recommended').filter({ hasText: 'Maya Chen' });
    await expect(maya).toHaveCount(1);
    await maya.click();
    const profile = desk.getByRole('dialog', { name: 'Source inspector', exact: true });
    await expect(profile.getByRole('heading', { name: 'Maya Chen', exact: true })).toBeVisible();
    requireCheck(await profile.locator('.desk-profile-citation blockquote').count() > 0, 'maya-profile-source-quotes-missing');
    await screenshot('05-recommended-recipient.png');
    await profile.getByRole('button', { name: 'Close source inspector', exact: true }).click();
    report.checks.mayaSelectedWithSourceProvenance = true;

    stage = 'download-synthetic-case-brief';
    const downloading = page.waitForEvent('download', { timeout: 30_000 });
    await desk.getByRole('button', { name: 'Download case brief', exact: true }).click();
    const download = await downloading;
    requireCheck(await download.failure() === null, 'case-brief-download-failed');
    const stream = await download.createReadStream();
    requireCheck(stream, 'case-brief-download-unreadable');
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of stream) {
      const buffer = Buffer.from(chunk);
      bytes += buffer.length;
      requireCheck(bytes <= 1_000_000, 'case-brief-exceeds-expected-size');
      chunks.push(buffer);
    }
    const brief = Buffer.concat(chunks).toString('utf8');
    requireCheck(brief.startsWith('# Witness Desk case brief\n') && brief.includes(DEMO_EVIDENCE) && brief.includes(INVOICE_TEXT), 'case-brief-missing-synthetic-source-records');
    const original = brief.split('## Original desk analysis\n')[1]?.split('\n## Additional Tinfoil review')[0];
    requireCheck(original && /^\s*Provider: tinfoil\s*$/m.test(original), 'case-brief-original-provider-is-not-tinfoil');
    requireCheck(original.includes('Invoiced: $120,000') && original.includes('Sent: $350,000') && original.includes('Difference: $230,000'), 'case-brief-amounts-incorrect');
    requireCheck(original.includes('Hosted inference verification') && original.includes('Inference verified.'), 'case-brief-inference-verification-missing');
    requireCheck(/^Suggested recipients:.*\bMaya Chen\b/m.test(original) && brief.includes('## Recipient source provenance'), 'case-brief-recipient-provenance-missing');
    requireCheck(!/readerSecret|senderCapability|witness-desk\.session|data:image\/|BEGIN (?:PGP )?PRIVATE KEY/i.test(brief), 'case-brief-contains-prohibited-private-fields');
    await writeFile(directory + 'case-brief.md', brief, { mode: 0o600, flag: 'wx' });
    report.artifacts.push('case-brief.md');
    report.checks.downloadedBriefMatchesOriginalAnalysis = true;
    report.checks.downloadedBriefIncludesHostedInferenceVerification = true;
    requireCheck(!blockedInsecureRequest, 'insecure-network-request-blocked');
    report.checks.httpsOnlyWithoutTlsExceptions = true;
    await screenshot('06-completed-preview.png');

    stage = 'reset-own-demo-desk';
    await resetFreshDesk();
    requireCheck(report.cleanup.freshDeskReset, 'fresh-desk-reset-did-not-complete');
    report.outcome = 'passed';
  } catch (error) {
    report.outcome = 'failed';
    report.failure = { stage, code: error instanceof BrowserVerificationFailure ? error.code : 'browser-flow-check-failed' };
    try { await screenshot('failure-masked.png'); } catch { /* Never dump screenshot errors. */ }
    if (!report.cleanup.attempted) await resetFreshDesk();
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}

async function main() {
  let options: ReturnType<typeof parseOptions>;
  try { options = parseOptions(); }
  catch (error) {
    process.stderr.write(`${error instanceof BrowserVerificationFailure ? error.code : 'invalid-configuration'}\n${usage}`);
    return 2;
  }
  if (!options) { process.stdout.write(usage); return 0; }
  // Disable Playwright debug output before its runtime import: protocol logs may expose storage.
  delete process.env.DEBUG;
  delete process.env.DEBUG_FILE;
  delete process.env.PWDEBUG;
  console.log = console.info = console.warn = console.error = () => {};
  const startedAt = new Date().toISOString();
  const run = `${startedAt.replace(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}`;
  const directory = fileURLToPath(new URL(`../artifacts/container-browser/${run}/`, import.meta.url));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const report: Report = {
    schemaVersion: 1, startedAt, outcome: 'running', target: options,
    scope: { browser: 'headless-chromium', interface: 'production-preview', evidence: 'fictional-cindy-payment', bootstrap: 'configuration-check-only-not-attestation', attestationDocument: 'not-exported-by-this-browser-check' },
    checks: {}, artifacts: [], cleanup: { attempted: false, freshDeskReset: false },
  };
  await verify(options, report, directory);
  report.finishedAt = new Date().toISOString();
  const reportFile = directory + 'result.json';
  await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  process.stdout.write(JSON.stringify({ outcome: report.outcome, reportFile, ...(report.failure ? { failure: report.failure } : {}) }) + '\n');
  return report.outcome === 'passed' ? 0 : 1;
}

main().then(code => { process.exitCode = code; }).catch(() => {
  process.stderr.write('Browser verifier could not finish or save its sanitized result.\n');
  process.exitCode = 1;
});
