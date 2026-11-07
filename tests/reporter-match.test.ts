import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reporterMatchInput, runReporterMatch, validateReporterMatches } from '../src/server/reporter-match';
import type { RecipientProfile, Submission } from '../src/shared/contracts';
import { DEMO_EVIDENCE } from '../src/shared/contracts';
import { createServer } from 'node:http';
import { once } from 'node:events';

const profile: RecipientProfile = {
  id: 'reporter-a', name: 'Reporter A', publication: 'Test publication', role: 'Reporter', region: 'United States', specialties: ['Finance'], bio: '',
  preparationProvider: 'darkbloom', preparationRunId: 'prepared-1',
  sources: [{ id: 'source-a', title: 'Financial reporting', text: 'Investigates company finances.', kind: 'public-web', url: 'https://example.com/a' }],
  supportingCitations: [{ documentId: 'source-a', title: 'Financial reporting', quote: 'Investigates company finances.' }],
};
const row = (): Submission => ({ id: 'private-case-id', receivedAt: new Date().toISOString(), state: 'ready', tip: { contributorAlias: 'Cindy', evidenceText: DEMO_EVIDENCE }, analysis: { kind: 'possible_overpayment', summary: '', invoiceAmount: 120000, paymentAmount: 350000, difference: 230000, citations: [], openQuestions: [], recipientIds: [], provider: 'ollama', model: 'local', durationMs: 1 } });
const match = { recipientId: profile.id, reason: 'Relevant experience investigating company finances.', sourceIds: ['source-a'] };

test('public reporter matches reject invented and cross-person source references', () => {
  assert.deepEqual(validateReporterMatches({ matches: [match] }, [profile]), [match]);
  assert.throws(() => validateReporterMatches({ matches: [{ ...match, recipientId: 'unknown' }] }, [profile]));
  assert.throws(() => validateReporterMatches({ matches: [{ ...match, sourceIds: ['someone-elses-source'] }] }, [profile]));
  assert.throws(() => validateReporterMatches({ matches: [match, match] }, [profile]));
});

test('matching snapshots public provenance, deduplicates requests, and preserves case analysis', async () => {
  const submission = row(); const original = submission.analysis; let calls = 0;
  const request = async () => { calls++; return { raw: { matches: [match] }, model: 'local' }; };
  await runReporterMatch(submission, [profile], ['us-finance'], 'ollama', request);
  await runReporterMatch(submission, [profile], ['us-finance'], 'ollama', request);
  assert.equal(calls, 1); assert.equal(submission.reporterMatch?.state, 'ready');
  assert.equal(submission.analysis, original);
  assert.notEqual(submission.reporterMatch?.profiles?.[0], profile);
  assert.doesNotMatch(reporterMatchInput(submission, [profile]), /private-case-id|readerSecret|senderCapability/);
});

test('unverified hosted matching and raw provider failures cannot become successful recommendations', async () => {
  const submission = row();
  await runReporterMatch(submission, [profile], ['us-finance'], 'tinfoil', async () => ({ raw: { matches: [match] }, model: 'hosted' }));
  assert.equal(submission.reporterMatch?.state, 'failed');
  await runReporterMatch(submission, [profile], ['us-finance'], 'ollama', async () => { throw new Error('PRIVATE EVIDENCE AND KEY'); });
  assert.doesNotMatch(submission.reporterMatch!.error!, /PRIVATE|KEY/);
  submission.state = 'analyzing';
  await assert.rejects(runReporterMatch(submission, [profile], ['us-finance'], 'ollama'), /Wait/);
});

test('a local model redirect cannot replay private case data to another endpoint', async () => {
  let redirectedRequests = 0;
  const server = createServer((request, response) => {
    if (request.url === '/api/chat') { response.writeHead(307, { Location: '/unexpected-target' }); response.end(); }
    else { redirectedRequests++; response.end(JSON.stringify({ message: { content: JSON.stringify({ matches: [match] }) } })); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const previousURL = process.env.OLLAMA_URL;
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    process.env.OLLAMA_URL = 'http://127.0.0.1:' + address.port;
    const submission = row();
    await runReporterMatch(submission, [profile], ['us-finance'], 'ollama');
    assert.equal(submission.reporterMatch?.state, 'failed');
    assert.equal(redirectedRequests, 0);
  } finally {
    if (previousURL === undefined) delete process.env.OLLAMA_URL; else process.env.OLLAMA_URL = previousURL;
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
