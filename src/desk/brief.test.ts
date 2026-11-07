import test from 'node:test';
import assert from 'node:assert/strict';
import { createCaseBrief } from './brief';
import type { Analysis, RecipientProfile, Submission } from '../shared/contracts';

test('case brief preserves both analyses and provenance without serializing image bodies or capabilities', () => {
  const analysis: Analysis = { kind: 'possible_overpayment', summary: 'A supported payment difference.', invoiceAmount: 120000, paymentAmount: 350000, difference: 230000, citations: [{ documentId: 'source-1', title: 'Payment record', quote: 'Original quote with ``` inside.' }], openQuestions: ['Was this payment approved?'], recipientIds: ['maya'], provider: 'ollama', model: 'local-test-model', durationMs: 1000 };
  const submission: Submission = {
    id: 'submission-1', state: 'ready', receivedAt: '2026-11-07T19:00:00Z',
    tip: { contributorAlias: 'Cindy', evidenceText: 'Reviewed payment text', photoId: 'private-photo-id' },
    analysis,
    tinfoilReview: { state: 'ready', analysis: { ...analysis, provider: 'tinfoil', model: 'tinfoil-test-model', openQuestions: ['What does the approval record show?'], verification: { securityVerified: true, verifiedAt: '2026-11-07T19:02:00Z', configRepo: 'test/public-config', enclaveHost: 'verified.example', releaseDigest: 'release-proof', codeFingerprint: 'code-proof', enclaveFingerprint: 'enclave-proof' } } },
    photo: { id: 'private-photo-id', provider: 'ollama', model: 'vision-test-model', durationMs: 2000, description: 'Unverified image description', extractedText: 'Unreviewed image text', uncertainties: ['One line is blurred.'] },
  };
  const profile: RecipientProfile = { id: 'maya', name: 'Maya Chen', publication: 'The Borough Ledger', role: 'Reporter', region: 'New York', specialties: ['Payments'], bio: 'Fictional reporter', preparationProvider: 'ollama', preparationRunId: 'graph-run-1', sources: [], supportingCitations: [{ documentId: 'portfolio-1', title: 'Reporting portfolio', quote: 'Exact portfolio quotation.' }] };
  // Runtime payloads can have extra fields even when the public TypeScript type does not.
  Object.assign(submission, { readerSecret: 'READER_SECRET_SENTINEL', senderCapability: 'SENDER_SECRET_SENTINEL' });
  Object.assign(submission.photo!, { dataUrl: 'data:image/jpeg;base64,IMAGE_BYTES_SENTINEL' });
  const brief = createCaseBrief(submission, [profile]);
  for (const expected of ['Reviewed payment text', '$230,000', 'local-test-model', 'tinfoil-test-model', 'vision-test-model', 'Was this payment approved?', 'What does the approval record show?', 'Maya Chen', 'Exact portfolio quotation.', 'graph-run-1', 'release-proof', 'code-proof', 'enclave-proof', 'Original quote with ``` inside.', '````text']) assert.ok(brief.includes(expected), `missing ${expected}`);
  for (const forbidden of ['READER_SECRET_SENTINEL', 'SENDER_SECRET_SENTINEL', 'IMAGE_BYTES_SENTINEL', 'data:image/', 'private-photo-id']) assert.ok(!brief.includes(forbidden), `leaked ${forbidden}`);
  submission.tinfoilReview!.state = 'failed';
  assert.ok(!createCaseBrief(submission, [profile]).includes('tinfoil-test-model'), 'failed review must not export a stale success');
});
