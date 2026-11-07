import type { Analysis, Citation, RecipientProfile, Submission } from '../shared/contracts';

const amount = (value: number | null) => value == null ? 'Not established' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
const line = (value: string) => value.replace(/[\r\n]+/g, ' ').replace(/[\\`*_{}\[\]<>#|~]/g, '\\$&');

function excerpt(text: string) {
  const longestRun = Math.max(0, ...(text.match(/`+/g) || []).map(run => run.length));
  const fence = '`'.repeat(Math.max(3, longestRun + 1));
  return `${fence}text\n${text}\n${fence}`;
}

function citations(items: Citation[]) {
  return items.map(item => `### ${line(item.title || item.documentId)}\n\nSource document: ${line(item.documentId)}\n\n${excerpt(item.quote)}`).join('\n\n');
}

function analysisSection(title: string, analysis: Analysis, profiles: RecipientProfile[]) {
  const recipientNames = analysis.recipientIds.map(id => profiles.find(profile => profile.id === id)?.name || 'Profile unavailable');
  const verification = analysis.verification;
  return [
    `## ${title}`,
    `Provider: ${line(analysis.provider)}  \nModel: ${line(analysis.model)}  \nDuration: ${analysis.durationMs} ms  \nFinding: ${line(analysis.kind)}`,
    line(analysis.summary),
    `Invoiced: ${amount(analysis.invoiceAmount)}  \nSent: ${amount(analysis.paymentAmount)}  \nDifference: ${amount(analysis.difference)}`,
    'Amounts and citations are derived by the application from the submitted records. Model output supplies investigation questions and recipient selections. These are leads for review, not verified wrongdoing.',
    `### Questions to investigate\n\n${analysis.openQuestions.map(question => `- ${line(question)}`).join('\n')}`,
    `Suggested recipients: ${recipientNames.length ? recipientNames.map(line).join('; ') : 'None selected'}`,
    ...(verification?.securityVerified ? [
      '### Hosted inference verification',
      'Inference verified. This metadata attests to the hosted inference service; application deployment is a separate attestation.',
      `Verified at: ${line(verification.verifiedAt)}  \nEnclave host: ${line(verification.enclaveHost)}  \nConfiguration repository: ${line(verification.configRepo)}  \nRelease digest: ${line(verification.releaseDigest)}  \nCode fingerprint: ${line(verification.codeFingerprint)}  \nEnclave fingerprint: ${line(verification.enclaveFingerprint)}`,
    ] : []),
    citations(analysis.citations),
  ].join('\n\n');
}

/** Select only evidence and provenance fields. Session credentials and raw image bytes are never serialized. */
export function createCaseBrief(submission: Submission, profiles: RecipientProfile[]): string {
  const review = submission.tinfoilReview;
  const additionalAnalysis = review?.state === 'ready' ? review.analysis : undefined;
  const selectedIds = new Set([...(submission.analysis?.recipientIds || []), ...(additionalAnalysis?.recipientIds || [])]);
  const sections = [
    '# Witness Desk case brief',
    'The submitted case is a fictional demonstration. Public reporter profiles, when included, describe real people using cited public sources. Evidence and model suggestions require human review. No recipient has received this case.',
    `Contributor alias: ${line(submission.tip.contributorAlias || 'Contributor')}  \nReceived: ${line(submission.receivedAt)}  \nSubmission: ${line(submission.id)}`,
    '## Submitted evidence text',
    'This is the text submitted by the contributor and used for comparison. For photo submissions, the contributor may have edited the model extraction.',
    excerpt(submission.tip.evidenceText),
  ];
  if (submission.tip.contextNote) sections.push('## Contributor context · unverified', excerpt(submission.tip.contextNote));
  if (submission.analysis) sections.push(analysisSection('Original desk analysis', submission.analysis, profiles));
  else sections.push('## Original desk analysis', 'No completed analysis is available.');
  if (additionalAnalysis) {
    sections.push(analysisSection('Additional Tinfoil review', additionalAnalysis, profiles));
    sections.push('Tinfoil reviewed the submitted text, contributor context, seeded invoice, and recipient expertise through verified inference. The photo was not sent to Tinfoil. The original desk analysis remains separate.');
  } else {
    sections.push('## Additional Tinfoil review', review?.state === 'analyzing' ? 'Review in progress; no completed result is included.' : review?.state === 'failed' ? 'Review failed; no completed result is included.' : 'Not requested.');
  }
  if (submission.photo) {
    const photo = submission.photo;
    sections.push('## Photo analysis provenance', `Provider: ${line(photo.provider)}  \nModel: ${line(photo.model)}  \nDuration: ${photo.durationMs} ms`, 'The image is not embedded in this brief. Model descriptions and extracted text are unverified; the comparison uses the contributor-reviewed submission above.', '### Model description · unverified', excerpt(photo.description), '### Text the model read · unverified', excerpt(photo.extractedText), '### Model uncertainty notes', photo.uncertainties.length ? photo.uncertainties.map(note => `- ${line(note)}`).join('\n') : 'No uncertainty notes were returned. This does not verify the image.');
  }
  sections.push('## Recipient source provenance', 'Reporting experience supports relevance. It does not verify identity, trustworthiness, or the truth of a tip. Profiles below reflect the current recipient graph.');
  for (const profile of profiles.filter(profile => selectedIds.has(profile.id))) {
    sections.push(`### ${line(profile.name)} · ${line(profile.publication)}`, `Role: ${line(profile.role)}  \nRegion: ${line(profile.region)}  \nSpecialties: ${profile.specialties.map(line).join(', ')}  \nPreparation provider: ${line(profile.preparationProvider)}  \nPreparation run: ${line(profile.preparationRunId)}`, citations(profile.supportingCitations));
  }
  if (!profiles.some(profile => selectedIds.has(profile.id))) sections.push('No selected recipient profile is available.');
  const matchRun = submission.reporterMatch;
  if (matchRun?.state === 'ready') {
    sections.push('## Public reporter matches', `Matching provider: ${line(matchRun.provider)}  \nModel: ${line(matchRun.model || 'Not recorded')}  \nDuration: ${matchRun.durationMs ?? 'Not recorded'} ms  \nCohorts: ${matchRun.cohortIds.map(line).join(', ')}  \nPreparation run: ${line(matchRun.preparationRunId || 'Not recorded')}`, 'Profiles and source excerpts below are the inputs saved with this matching run. A match indicates reporting relevance, not verified identity, availability, or willingness to accept a tip.');
    if (matchRun.verification?.securityVerified) {
      const verification = matchRun.verification;
      sections.push('### Matching inference verification', `Verified at: ${line(verification.verifiedAt)}  \nEnclave host: ${line(verification.enclaveHost)}  \nConfiguration repository: ${line(verification.configRepo)}  \nRelease digest: ${line(verification.releaseDigest)}  \nCode fingerprint: ${line(verification.codeFingerprint)}  \nEnclave fingerprint: ${line(verification.enclaveFingerprint)}`);
    }
    for (const [index, match] of (matchRun.matches || []).entries()) {
      // A later network refresh must not silently change the provenance of an earlier match.
      const profile = matchRun.profiles?.find(candidate => candidate.id === match.recipientId);
      if (!profile) { sections.push(`### Match ${index + 1}`, 'The profile snapshot is unavailable.'); continue; }
      sections.push(`### ${index + 1}. ${line(profile.name)} · ${line(profile.publication)}`, `Role: ${line(profile.role)}  \nRegion: ${line(profile.region)}  \nSpecialties: ${profile.specialties.map(line).join(', ')}  \nProfile preparation provider: ${line(profile.preparationProvider)}  \nProfile preparation run: ${line(profile.preparationRunId)}`, `Matching reason: ${line(match.reason)}`);
      for (const sourceId of match.sourceIds) {
        const source = profile.sources.find(candidate => candidate.id === sourceId);
        if (!source) { sections.push(`Source ${line(sourceId)} is unavailable in the matching snapshot.`); continue; }
        sections.push(`#### ${line(source.title)}`, `Source document: ${line(source.id)}  \nSource type: ${line(source.sourceType || 'Not recorded')}  \nRelationship: ${line(source.relation || 'Not recorded')}  \nRetrieved: ${line(source.retrievedAt || 'Not recorded')}`);
        if (source.url) sections.push('Exact source URL:', excerpt(source.url));
        const supporting = profile.supportingCitations.filter(citation => citation.documentId === source.id);
        sections.push(supporting.length ? citations(supporting) : excerpt(source.text));
      }
      if (profile.publicContact) sections.push(`Public professional contact page (${profile.publicContact.scope}):`, excerpt(profile.publicContact.url), `Contact source: ${line(profile.publicContact.sourceId)}`);
    }
    if (!matchRun.matches?.length) sections.push('No supported public reporter matches.');
  } else if (matchRun) {
    sections.push('## Public reporter matches', matchRun.state === 'matching' ? 'Matching is in progress; no completed result is included.' : 'Matching failed; no completed result is included.');
  }
  return sections.join('\n\n') + '\n';
}

export function downloadCaseBrief(submission: Submission, profiles: RecipientProfile[]) {
  const blob = new Blob([createCaseBrief(submission, profiles)], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `witness-desk-case-${submission.id.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 36) || 'brief'}.md`;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
