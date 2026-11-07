import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileText, LoaderCircle } from 'lucide-react';
import type { Submission } from '../shared/contracts';
import { containsContributorAlias, createStoryPacket, finalizeStoryPacket } from './story-packet';
import type { StoryPacket } from './story-packet';

function saveFile(filename: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.style.display = 'none';
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function StoryPacketPanel({ submission }: { submission: Submission }) {
  const [recipientId, setRecipientId] = useState('');
  const [includePhotoAnalysis, setIncludePhotoAnalysis] = useState(false);
  const [packet, setPacket] = useState<StoryPacket | null>(null);
  const [preview, setPreview] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const revision = useRef(0);
  const matching = submission.reporterMatch;
  const matchedProfiles = matching?.state === 'ready' ? (matching.matches || []).flatMap(match => {
    const profile = matching.profiles?.find(candidate => candidate.id === match.recipientId && candidate.sources.some(source => source.kind === 'public-web'));
    return profile ? [profile] : [];
  }) : [];
  const sourceVersion = useMemo(() => JSON.stringify({ analysis: submission.analysis, review: submission.tinfoilReview, matching, evidence: submission.tip.evidenceText, photo: includePhotoAnalysis ? submission.photo : undefined }), [submission, includePhotoAnalysis, matching]);

  useEffect(() => {
    revision.current += 1;
    setPacket(null); setPreview(''); setReviewed(false); setError('');
  }, [sourceVersion]);

  function invalidate() {
    revision.current += 1;
    setPacket(null); setPreview(''); setReviewed(false); setError('');
  }

  function prepare() {
    try {
      const next = createStoryPacket(submission, recipientId, { includePhotoAnalysis });
      revision.current += 1;
      setPacket(next); setPreview(next.markdown); setReviewed(false); setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not prepare the story packet.'); }
  }

  async function download(format: 'markdown' | 'manifest') {
    if (!packet || !reviewed || !preview.trim() || busy) return;
    const atRevision = revision.current;
    setBusy(true); setError('');
    try {
      const output = await finalizeStoryPacket(packet, preview);
      if (revision.current !== atRevision) return;
      if (format === 'markdown') saveFile('story-packet.md', output.markdown, 'text/markdown;charset=utf-8');
      else saveFile('story-packet-evidence.json', JSON.stringify(output.manifest, null, 2) + '\n', 'application/json');
    } catch { setError('Could not create the packet download.'); }
    finally { setBusy(false); }
  }

  const manifestEvidence = packet ? JSON.stringify({ originalEvidence: packet.manifest.originalEvidence, publicSources: packet.manifest.publicSources, ...(packet.manifest.photoAnalysis ? { photoAnalysis: packet.manifest.photoAnalysis } : {}) }, null, 2) : '';

  return <details className="desk-story-panel">
    <summary>Prepare story packet</summary>
    <div className="desk-story-form">
      <label>Recipient<select aria-label="Story packet recipient" value={recipientId} onChange={event => { invalidate(); setRecipientId(event.target.value); }}><option value="">Choose a reporter</option>{matchedProfiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name} · {profile.publication}</option>)}</select></label>
      {!matchedProfiles.length && <p>Find reporter matches first.</p>}
      {submission.photo && <label className="desk-story-confirm"><input type="checkbox" checked={includePhotoAnalysis} onChange={event => { invalidate(); setIncludePhotoAnalysis(event.target.checked); }} />Include photo analysis</label>}
      <button className="desk-secondary" onClick={prepare} disabled={!matchedProfiles.some(profile => profile.id === recipientId) || busy}><FileText size={15} />Prepare story packet</button>
      {packet && <>
        <p>Review the preview for identifying details; exact source text may identify the contributor.</p>
        <label>Story packet preview<textarea aria-label="Story packet preview" rows={18} spellCheck={false} value={preview} onChange={event => { revision.current += 1; setPreview(event.target.value); setReviewed(false); }} /></label>
        {containsContributorAlias(preview, submission.tip.contributorAlias) && <p className="desk-story-error" role="alert">Contributor alias appears in the preview.</p>}
        <p id="story-manifest-review-note">Editing the preview does not redact the evidence manifest. Review its original records before downloading.</p>
        <details className="desk-details"><summary>Preview original manifest evidence</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 13 }}>{manifestEvidence}</pre><p>SHA-256 checks file integrity, not evidence truth or identity.</p></details>
        {containsContributorAlias(manifestEvidence, submission.tip.contributorAlias) && <p className="desk-story-error" role="alert">Contributor alias appears in the manifest evidence.</p>}
        <label className="desk-story-confirm"><input type="checkbox" aria-describedby="story-manifest-review-note" checked={reviewed} onChange={event => { revision.current += 1; setReviewed(event.target.checked); }} />I reviewed this story packet.</label>
        <div className="desk-story-actions"><button className="desk-primary" onClick={() => void download('markdown')} disabled={!reviewed || !preview.trim() || busy}>{busy ? <LoaderCircle className="desk-spin" size={15} /> : <Download size={15} />}Download story packet</button><button className="desk-secondary" onClick={() => void download('manifest')} disabled={!reviewed || !preview.trim() || busy}><Download size={15} />Download evidence manifest</button></div>
      </>}
      {error && <p className="desk-story-error" role="alert">{error}</p>}
    </div>
  </details>;
}
