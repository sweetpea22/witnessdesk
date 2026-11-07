import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildPublicPreparationMessages, buildPublicReporterGraph, readBoundedPublicHTML, selectPreparedPublicProfiles,
  validatePublicExtraction, validatePublicSeedCorpus, validatePublicSourceURL, validateRefreshedPublicPage,
} from './public-network';
import type { RecipientProfile, ReporterNetwork } from '../shared/contracts';

const seeds = validatePublicSeedCorpus(JSON.parse(readFileSync(new URL('../../fixtures/public-reporter-seeds.json', import.meta.url), 'utf8')));
const valid = () => ({ profiles: seeds.reporters.map(reporter => ({ id: reporter.id, evidence: reporter.sources.flatMap(source => source.supportedTopics.map(specialty => ({ specialty, sourceId: source.id, quote: source.excerpt }))) })) });

test('public extraction accepts one article with an identity biography, without inventing expertise from the bio', () => {
  const parsed = validatePublicExtraction(valid(), seeds);
  const identityOnly = seeds.reporters.find(reporter => reporter.sources.some(source => source.kind === 'bio' && source.supportedTopics.length === 0))!;
  assert.ok(identityOnly);
  const evidence = parsed.find(reporter => reporter.id === identityOnly.id)!.evidence;
  assert.ok(evidence.every(item => identityOnly.articleSourceIds.includes(item.sourceId)));
  assert.equal(parsed.length, 6);
});

test('unknown and repeated reporter IDs are rejected', () => {
  const unknown = valid();
  unknown.profiles[0].id = 'invented-reporter';
  assert.throws(() => validatePublicExtraction(unknown, seeds), /unknown reporter/);
  const duplicate = valid();
  duplicate.profiles[1].id = duplicate.profiles[0].id;
  assert.throws(() => validatePublicExtraction(duplicate, seeds), /repeated a reporter ID/);
});

test('model evidence cannot cross people, invent quotations, or attach unsupported topics', () => {
  const crossPerson = valid();
  crossPerson.profiles[0].evidence[0] = crossPerson.profiles[1].evidence[0];
  assert.throws(() => validatePublicExtraction(crossPerson, seeds), /cross-person source/);
  const invented = valid();
  invented.profiles[0].evidence[0].quote += ' This source is guaranteed trustworthy.';
  assert.throws(() => validatePublicExtraction(invented, seeds), /exactly match/);
  const unsupported = valid();
  unsupported.profiles[0].evidence[0].specialty = 'Environment';
  assert.throws(() => validatePublicExtraction(unsupported, seeds), /not supported by this source/);
  const duplicate = valid();
  duplicate.profiles[0].evidence.push(duplicate.profiles[0].evidence[0]);
  assert.throws(() => validatePublicExtraction(duplicate, seeds), /repeated a source\/topic/);
});

test('seed validation preserves attribution and rejects cross-person article bylines', () => {
  const bad = structuredClone(seeds);
  bad.reporters[0].sources.find(source => source.kind === 'article')!.byline = 'An unrelated writer';
  assert.throws(() => validatePublicSeedCorpus(bad), /byline does not identify/);
  const reused = structuredClone(seeds);
  reused.reporters[1].sources[0].id = reused.reporters[0].sources[0].id;
  assert.throws(() => validatePublicSeedCorpus(reused), /Duplicate reporter or source ID/);
});

test('preparation payload projects only public sources even if caller objects carry private fields', () => {
  const contaminated = structuredClone(seeds);
  const secret = 'PRIVATE_DESK_CINDY_PAYMENT_350000_NOT_PUBLIC';
  Object.assign(contaminated, { tip: secret, readerSecret: secret });
  Object.assign(contaminated.reporters[0], { evidenceText: secret, contextNote: secret });
  Object.assign(contaminated.reporters[0].sources[0], { privateEndorsements: secret });
  const messages = buildPublicPreparationMessages(contaminated);
  const wire = JSON.stringify(messages);
  assert.equal(wire.includes(secret), false);
  const payload = JSON.parse(messages[1].content);
  assert.deepEqual(Object.keys(payload), ['reporters']);
  assert.equal(payload.reporters.length, seeds.reporters.length);
  assert.equal(payload.reporters[0].sources[0].excerpt, seeds.reporters[0].sources[0].excerpt);
});

test('public fetch allowlist rejects unsafe URLs and off-host redirects without network requests', () => {
  const source = seeds.reporters[0].sources[0].url;
  const allowed = seeds.reporters.flatMap(reporter => reporter.sources.map(item => item.url));
  assert.equal(validatePublicSourceURL(source, allowed).href, source);
  for (const unsafe of ['http://127.0.0.1/private', 'https://127.0.0.1/private', 'https://[::1]/private', 'https://localhost/private', 'https://169.254.169.254/latest/meta-data', 'https://user:pass@www.propublica.org/people/paul-kiel', source + '#private']) {
    assert.throws(() => validatePublicSourceURL(unsafe, [...allowed, unsafe]), /HTTPS|private or local/);
  }
  assert.throws(() => validatePublicSourceURL('https://www.propublica.org/unlisted', allowed), /not in the curated allowlist/);
  assert.throws(() => validatePublicSourceURL('https://another.example/redirect', allowed, source), /original seed host/);
  assert.equal(validatePublicSourceURL(source + '/', allowed, source).hostname, new URL(source).hostname);
});

test('refresh verifies visible normalized text and ignores scripts, styles, and templates', () => {
  const quote = 'A verified public reporting excerpt.';
  const visible = validateRefreshedPublicPage(`<html><body><article>A verified\n public reporting <b>excerpt.</b></article><script>private injected instructions</script></body></html>`, quote);
  assert.equal(visible, quote);
  for (const tag of ['script', 'style', 'template', 'noscript']) {
    assert.throws(() => validateRefreshedPublicPage(`<html><body><${tag}>${quote}</${tag}><p>Changed content</p></body></html>`, quote), /no longer present/);
  }
});

test('HTML response byte limit is enforced with and without a Content-Length header', async () => {
  await assert.rejects(readBoundedPublicHTML(new Response('small body', { headers: { 'content-type': 'text/html', 'content-length': String(2 * 1024 * 1024 + 1) } })), /2 MB/);
  await assert.rejects(readBoundedPublicHTML(new Response(new Uint8Array(2 * 1024 * 1024 + 1), { headers: { 'content-type': 'text/html' } })), /2 MB/);
  await assert.rejects(readBoundedPublicHTML(new Response('not html', { headers: { 'content-type': 'application/json' } })), /HTML page/);
  assert.equal(await readBoundedPublicHTML(new Response('<p>Public</p>', { headers: { 'content-type': 'text/html' } })), '<p>Public</p>');
});

function profileFixture(): RecipientProfile {
  const reporter = seeds.reporters[0];
  return { id: reporter.id, name: reporter.name, publication: reporter.publication, role: reporter.role, region: reporter.coverageRegion,
    bio: reporter.sources[0].excerpt, specialties: ['Finance'], cohortIds: reporter.cohortIds,
    preparationProvider: 'darkbloom', preparationRunId: 'previous-successful-run',
    sources: reporter.sources.map(source => ({ id: source.id, title: source.title, text: source.excerpt, url: source.url, kind: 'public-web', sourceType: source.kind, relation: source.relation })),
    supportingCitations: reporter.sources.map(source => ({ documentId: source.id, title: source.title, quote: source.excerpt })) };
}

test('public graph distinguishes biographies and reporting without inventing geographic evidence', () => {
  const profile = profileFixture();
  const extraction = validatePublicExtraction(valid(), seeds);
  const graph = buildPublicReporterGraph([profile], extraction);
  assert.ok(graph.nodes.some(node => node.id === profile.id && node.type === 'recipient'));
  assert.ok(graph.edges.some(edge => edge.target === profile.sources[0].id && edge.label === 'profile source'));
  assert.ok(graph.edges.some(edge => edge.target === profile.sources[1].id && edge.label === 'published reporting'));
  assert.equal(graph.nodes.some(node => node.type === 'region'), false);
  assert.ok(graph.edges.some(edge => edge.label === 'supports coverage of' && edge.source === profile.sources[1].id));
  assert.ok(graph.edges.every(edge => edge.label !== 'authored' && edge.label !== 'reports from'));
});

test('cohort selection rejects unknown groups and failed preparation despite last-known profiles', () => {
  const profile = profileFixture();
  const network: ReporterNetwork = { cohorts: seeds.cohorts, profiles: [profile], graph: { nodes: [], edges: [] }, preparation: { state: 'ready', provider: 'darkbloom', model: 'test', profileCount: 1, sourceCount: 2 } };
  assert.throws(() => selectPreparedPublicProfiles(network, ['unknown-cohort']), /known public reporter cohorts/);
  assert.throws(() => selectPreparedPublicProfiles(network, []), /known public reporter cohorts/);
  const selected = selectPreparedPublicProfiles(network, ['us-finance']);
  assert.equal(selected[0].id, profile.id);
  selected[0].preparationProvider = 'modified';
  assert.equal(profile.preparationProvider, 'darkbloom');
  network.preparation.state = 'failed';
  assert.throws(() => selectPreparedPublicProfiles(network, ['us-finance']), /not ready/);
  assert.equal(network.profiles[0].preparationRunId, 'previous-successful-run');
});
