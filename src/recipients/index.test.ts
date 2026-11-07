import test from 'node:test';
import assert from 'node:assert/strict';
import { PORTFOLIOS } from '../../fixtures/recipient-portfolios';
import { getRecipientGraph, getRecipientProfiles, matchRecipients, prepareRecipientProfiles, validateExtraction } from './index';

const valid = () => ({ profiles: PORTFOLIOS.map(p => ({ id: p.id, region: p.region, evidence: p.seedEvidence.map(e => ({ ...e })) })) });

test('retains exact source-backed specialties for every recipient', () => {
  const extracted = validateExtraction(valid());
  assert.equal(extracted.length, 3);
  assert.ok(extracted[0].evidence.some(e => e.specialty === 'Payments'));
});
test('rejects a fluent but invented supporting quote', () => {
  const data = valid();
  data.profiles[0].evidence[0].quote = 'Maya Chen has special expertise in Procurement fraud.';
  assert.throws(() => validateExtraction(data), /quote does not appear/);
});
test('rejects attributing another recipient article to Maya', () => {
  const data = valid();
  data.profiles[0].evidence[0] = { ...data.profiles[1].evidence[0] };
  assert.throws(() => validateExtraction(data), /quote does not appear/);
});
test('rejects unsupported expertise even with a real quote', () => {
  const data = valid();
  data.profiles[0].evidence[0].specialty = 'Water quality';
  assert.throws(() => validateExtraction(data), /explicitly support/);
});
test('Cindy payment discrepancy prioritizes procurement and payments', () => {
  const matches = matchRecipients('Invoice INV204 was for $120,000 but the bank payment sent to the supplier was $350,000.');
  assert.equal(matches[0], 'maya-chen');
  assert.deepEqual(matchRecipients('workers report unpaid overtime wages'), ['luis-rivera']);
});
test('every graph edge resolves to existing nodes and a source document', () => {
  const graph = getRecipientGraph();
  const ids = new Set(graph.nodes.map(n => n.id));
  const sourceIds = new Set(PORTFOLIOS.flatMap(p => p.sources.map(s => s.id)));
  for (const edge of graph.edges) {
    assert.ok(ids.has(edge.source)); assert.ok(ids.has(edge.target));
    assert.ok(edge.sourceDocumentId && sourceIds.has(edge.sourceDocumentId));
  }
});
test('concurrent preparation shares one job and failure preserves the prior graph labels', async () => {
  const before = getRecipientProfiles();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ message: { content: '{"profiles":[]}' } }));
  };
  try {
    const first = prepareRecipientProfiles({ provider: 'ollama' });
    const second = prepareRecipientProfiles({ provider: 'ollama' });
    assert.equal(first, second);
    const result = await first;
    assert.equal(result.state, 'failed');
    assert.equal(calls, 2, 'one initial attempt and one correction');
    assert.deepEqual(getRecipientProfiles(), before);
  } finally { globalThis.fetch = originalFetch; }
});
