import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { containsContributorAlias, createStoryPacket, finalizeStoryPacket } from './story-packet';
import { DEMO_EVIDENCE, INVOICE_TEXT } from '../shared/contracts';
import type { RecipientProfile, Submission } from '../shared/contracts';

function fixture() {
  const profile: RecipientProfile = { id: 'chosen', name: 'Selected Reporter', publication: 'Public Newsroom', role: 'Reporter', region: 'United States', specialties: ['Finance'], bio: 'Public biography', preparationProvider: 'darkbloom', preparationRunId: 'public-prep-run', sources: [{ id: 'public-source', title: 'Public reporting', text: 'Exact public source quotation with ``` inside.', url: 'https://news.example/finance?article=1&view=full', kind: 'public-web', retrievedAt: '2026-11-07T20:00:00Z' }], supportingCitations: [{ documentId: 'public-source', title: 'Public reporting', quote: 'Exact public source quotation with ``` inside.' }] };
  const submission: Submission = { id: 'OMIT_CASE_ID', receivedAt: 'OMIT_INTAKE_TIMESTAMP', state: 'ready', tip: { contributorAlias: 'Cindy', contextNote: 'OMIT_DEFAULT_CONTEXT', evidenceText: DEMO_EVIDENCE, photoId: 'OMIT_PHOTO_ID' }, analysis: { kind: 'possible_overpayment', summary: 'OMIT_UNSELECTED_SUMMARY', invoiceAmount: 120000, paymentAmount: 350000, difference: 230000, citations: [], openQuestions: ['Was the payment approved?'], recipientIds: ['fictional-maya'], provider: 'ollama', model: 'analysis-model', durationMs: 1000 }, photo: { id: 'OMIT_PHOTO_ID', provider: 'ollama', model: 'OMIT_DEFAULT_PHOTO_MODEL', description: 'Unverified photo description', extractedText: 'Unreviewed OCR', uncertainties: ['A line is blurred.'], durationMs: 2000 }, reporterMatch: { state: 'ready', cohortIds: ['finance'], provider: 'ollama', model: 'matching-model', durationMs: 900, preparationRunId: 'public-prep-run', profiles: [profile, { ...profile, id: 'other', name: 'Other Reporter' }], matches: [{ recipientId: profile.id, reason: 'Relevant corporate-payment reporting.', sourceIds: ['public-source'] }, { recipientId: 'other', reason: 'Other reason', sourceIds: ['public-source'] }] } };
  Object.assign(submission, { readerSecret: 'OMIT_READER_SECRET', senderCapability: 'OMIT_SENDER_CAPABILITY', sessionId: 'OMIT_SESSION_ID' });
  return submission;
}

test('story packet includes only the selected reporter and literal source chronology while omitting intake metadata', () => {
  const packet = createStoryPacket(fixture(), 'chosen');
  const serialized = JSON.stringify(packet);
  for (const expected of [INVOICE_TEXT, DEMO_EVIDENCE, '$230,000', 'Selected Reporter', 'analysis-model', 'matching-model', 'public-prep-run', 'Relevant corporate-payment reporting.', 'https://news.example/finance?article=1&view=full', 'Exact public source quotation with ``` inside.', '````text']) assert.ok(packet.markdown.includes(expected), `missing ${expected}`);
  for (const omitted of ['OMIT_', 'Cindy', 'fictional-maya', 'Other Reporter', 'Other reason']) assert.ok(!serialized.includes(omitted), `unexpected ${omitted}`);
  assert.deepEqual(packet.manifest.chronology.map(item => item.date), ['2026-11-03', '2026-11-05']);
  assert.throws(() => createStoryPacket(fixture(), 'not-matched'));
});

test('reviewed Markdown hash matches final text while the manifest preserves original source evidence', async () => {
  const packet = createStoryPacket(fixture(), 'chosen');
  const edited = 'Operator-edited story preview.\n';
  const output = await finalizeStoryPacket(packet, edited);
  assert.equal(output.markdown, edited);
  assert.equal(output.manifest.operatorReviewedMarkdown, edited);
  assert.equal(output.manifest.markdownSha256, createHash('sha256').update(edited).digest('hex'));
  assert.equal(output.manifest.originalEvidence[1].text, DEMO_EVIDENCE);
  assert.equal(output.manifest.publicSources[0].quotes[0], 'Exact public source quotation with ``` inside.');
  assert.equal(output.manifest.limits.wrongdoingEstablished, false);
});

test('optional photo output stays unverified and identifying quotations are preserved for review', () => {
  const submission = fixture();
  submission.tip.evidenceText += '\nSigned by Cindy';
  const packet = createStoryPacket(submission, 'chosen', { includePhotoAnalysis: true });
  assert.ok(packet.markdown.includes('Signed by Cindy'));
  assert.equal(containsContributorAlias(packet.markdown, 'cindy'), true);
  assert.equal(containsContributorAlias(packet.markdown, 'Cind'), false);
  assert.equal(packet.manifest.photoAnalysis?.status, 'unverified-model-output');
  assert.equal(packet.manifest.photoAnalysis?.imageEmbedded, false);
  assert.ok(!JSON.stringify(packet).includes('OMIT_PHOTO_ID'));
});
