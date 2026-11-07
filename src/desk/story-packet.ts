import { INVOICE_TEXT } from '../shared/contracts';
import type { Analysis, InferenceVerification, Submission } from '../shared/contracts';

const line = (value: string) => value.replace(/[\r\n]+/g, ' ').replace(/[\\`*_{}\[\]<>#|~]/g, '\\$&');
const money = (value: number | null) => value == null ? 'Not established' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
const quote = (text: string) => {
  const fence = '`'.repeat(Math.max(3, ...(text.match(/`+/g) || []).map(run => run.length + 1)));
  return `${fence}text\n${text}\n${fence}`;
};

function verificationFields(value?: InferenceVerification) {
  if (!value?.securityVerified) return undefined;
  return { securityVerified: true as const, verifiedAt: value.verifiedAt, configRepo: value.configRepo, enclaveHost: value.enclaveHost, releaseDigest: value.releaseDigest, codeFingerprint: value.codeFingerprint, enclaveFingerprint: value.enclaveFingerprint };
}

function analysisMetadata(analysis: Analysis) {
  return { provider: analysis.provider, model: analysis.model, durationMs: analysis.durationMs, verification: verificationFields(analysis.verification) };
}

function metadataText(label: string, value: ReturnType<typeof analysisMetadata>) {
  const parts = [`### ${label}`, `Provider: ${line(value.provider)}  \nModel: ${line(value.model)}  \nDuration: ${value.durationMs} ms`];
  if (value.verification) parts.push(`Inference verified at: ${line(value.verification.verifiedAt)}  \nEnclave: ${line(value.verification.enclaveHost)}  \nConfiguration: ${line(value.verification.configRepo)}  \nRelease digest: ${line(value.verification.releaseDigest)}  \nCode fingerprint: ${line(value.verification.codeFingerprint)}  \nEnclave fingerprint: ${line(value.verification.enclaveFingerprint)}`);
  return parts.join('\n\n');
}

function literalDate(text: string, label: 'Date' | 'Date sent') {
  const match = text.match(new RegExp(`^${label}:[ \\t]*(\\d{4}-\\d{2}-\\d{2})[ \\t]*$`, 'm'));
  return match ? { date: match[1], quote: match[0] } : null;
}

/** Allowlisted fields only. Private intake metadata is never spread or serialized. */
export function createStoryPacket(submission: Submission, recipientId: string, options: { includePhotoAnalysis?: boolean } = {}) {
  const matching = submission.reporterMatch;
  const match = matching?.state === 'ready' ? matching.matches?.find(item => item.recipientId === recipientId) : undefined;
  const profile = match && matching?.profiles?.find(item => item.id === recipientId && item.sources.some(source => source.kind === 'public-web'));
  if (!match || !profile || !matching || !submission.analysis) throw new Error('Choose a matched public reporter after analysis completes.');
  const analysis = submission.analysis;
  const sourceIds = new Set(match.sourceIds);
  const publicSources = profile.sources.filter(source => source.kind === 'public-web' && sourceIds.has(source.id)).map(source => {
    const supported = profile.supportingCitations.filter(citation => citation.documentId === source.id && source.text.includes(citation.quote));
    return { title: source.title, url: source.url, retrievedAt: source.retrievedAt, sourceType: source.sourceType, relation: source.relation, contentHash: source.contentHash, quotes: supported.length ? supported.map(citation => citation.quote) : [source.text] };
  });
  const invoiceDate = literalDate(INVOICE_TEXT, 'Date');
  const paymentDate = literalDate(submission.tip.evidenceText, 'Date sent');
  const chronology = [
    ...(invoiceDate ? [{ ...invoiceDate, label: 'Invoice date', source: 'Invoice' }] : []),
    ...(paymentDate ? [{ ...paymentDate, label: 'Payment sent date', source: 'Submitted payment record' }] : []),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const additional = submission.tinfoilReview?.state === 'ready' ? submission.tinfoilReview.analysis : undefined;
  const questions = [...new Set([...analysis.openQuestions, ...(additional?.openQuestions || [])])];
  const photo = options.includePhotoAnalysis && submission.photo ? {
    status: 'unverified-model-output' as const, provider: submission.photo.provider, model: submission.photo.model,
    durationMs: submission.photo.durationMs, description: submission.photo.description,
    extractedText: submission.photo.extractedText, uncertainties: [...submission.photo.uncertainties], imageEmbedded: false,
  } : undefined;
  const manifest = {
    schemaVersion: 1,
    kind: 'fictional-story-packet' as const,
    recipient: { name: profile.name, publication: profile.publication, role: profile.role, region: profile.region, specialties: [...profile.specialties], fitReason: match.reason },
    comparison: { invoiceAmount: analysis.invoiceAmount, paymentAmount: analysis.paymentAmount, difference: analysis.difference, finding: analysis.kind },
    originalEvidence: [{ title: 'Invoice', text: INVOICE_TEXT }, { title: 'Submitted payment record', text: submission.tip.evidenceText }],
    chronology, openQuestions: questions, publicSources,
    provenance: {
      originalAnalysis: analysisMetadata(analysis), additionalReview: additional ? analysisMetadata(additional) : undefined,
      matching: { provider: matching.provider, model: matching.model, durationMs: matching.durationMs, verification: verificationFields(matching.verification) },
      preparation: { provider: profile.preparationProvider, runId: profile.preparationRunId },
    },
    ...(photo ? { photoAnalysis: photo } : {}),
    limits: { syntheticCase: true, wrongdoingEstablished: false, recipientContacted: false, hashClaim: 'File integrity only; hashes do not verify evidence truth or identity.' },
  };
  const sections = [
    `# Story packet for ${line(profile.name)}`,
    'Fictional payment-discrepancy demonstration. This synthetic case is not an allegation about a real person or organization.',
    `Prepared for: ${line(profile.name)} · ${line(profile.publication)}`,
    '## What the records support',
    `Invoiced: ${money(analysis.invoiceAmount)}  \nSent: ${money(analysis.paymentAmount)}  \nDifference: ${money(analysis.difference)}`,
    analysis.difference == null ? 'The supplied text does not establish a complete payment comparison.' : analysis.difference > 0 ? 'The payment record exceeds the invoice. The reason for the difference is not established.' : 'These records do not show a payment exceeding the invoice.',
    'The records alone do not establish fraud, intent, approval, or the destination of any excess payment.',
    '## Record chronology',
    chronology.length ? chronology.map(item => `- ${item.date}: ${item.label} (${item.source}; quoted field: ${line(item.quote)}).`).join('\n') : 'No literal record dates were found.',
    '## Invoice', quote(INVOICE_TEXT),
    '## Submitted payment record', quote(submission.tip.evidenceText),
    '## Questions to investigate', questions.map(question => `- ${line(question)}`).join('\n'),
    '## Why this reporter', line(match.reason),
    'Relevance comes from public reporting sources. It does not establish availability, willingness to receive a tip, or verified identity.',
  ];
  for (const source of publicSources) {
    sections.push(`### ${line(source.title)}`);
    if (source.url) sections.push('Exact source URL:', quote(source.url));
    if (source.retrievedAt) sections.push(`Retrieved: ${line(source.retrievedAt)}`);
    sections.push(...source.quotes.map(quote));
  }
  sections.push('## Processing provenance', metadataText('Original analysis', manifest.provenance.originalAnalysis));
  if (manifest.provenance.additionalReview) sections.push(metadataText('Additional review', manifest.provenance.additionalReview));
  sections.push(`### Reporter matching\n\nProvider: ${line(matching.provider)}  \nModel: ${line(matching.model || 'Not recorded')}  \nDuration: ${matching.durationMs ?? 'Not recorded'} ms`, `### Profile preparation\n\nProvider: ${line(profile.preparationProvider)}  \nRun: ${line(profile.preparationRunId)}`);
  if (matching.verification?.securityVerified) sections.push(metadataText('Matching attestation', { provider: matching.provider, model: matching.model || 'Not recorded', durationMs: matching.durationMs || 0, verification: verificationFields(matching.verification) }));
  if (photo) sections.push('## Photo analysis · unverified', 'The processed photo is available at the desk; no image is embedded in this packet.', `Provider: ${line(photo.provider)}  \nModel: ${line(photo.model)}  \nDuration: ${photo.durationMs} ms`, '### Model description', quote(photo.description), '### Model-extracted text', quote(photo.extractedText), '### Model uncertainty notes', photo.uncertainties.length ? photo.uncertainties.map(value => `- ${line(value)}`).join('\n') : 'None reported.');
  return { markdown: sections.join('\n\n') + '\n', manifest };
}

export type StoryPacket = ReturnType<typeof createStoryPacket>;

export async function finalizeStoryPacket(packet: StoryPacket, reviewedMarkdown: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(reviewedMarkdown));
  const markdownSha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return { markdown: reviewedMarkdown, manifest: { ...packet.manifest, operatorReviewedMarkdown: reviewedMarkdown, markdownSha256, hashAlgorithm: 'SHA-256' as const, originalEvidencePreserved: true } };
}

export function containsContributorAlias(brief: string, alias: string): boolean {
  const trimmed = alias.trim();
  if (!trimmed) return false;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu').test(brief);
}
