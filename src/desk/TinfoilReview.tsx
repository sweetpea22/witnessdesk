import { useState } from 'react';
import { ArrowUpRight, Check, ChevronRight, FileText, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { reviewWithTinfoil } from '../shared/api';
import type { Citation, DeskSession, RecipientProfile, Submission } from '../shared/contracts';

type Props = {
  session: DeskSession;
  submission: Submission;
  configured: boolean;
  profiles: RecipientProfile[];
  onUpdated: () => Promise<void>;
  onCitation: (citation: Citation) => void;
  onProfile: (profile: RecipientProfile) => void;
};

export default function TinfoilReview({ session, submission, configured, profiles, onUpdated, onCitation, onProfile }: Props) {
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState('');
  const review = submission.tinfoilReview;
  const running = requesting || review?.state === 'analyzing';
  const result = review?.state === 'ready' ? review.analysis : undefined;
  const failure = requestError || (review?.state === 'failed' ? review.error || 'The review could not finish.' : '');
  const canReview = configured && submission.state === 'ready' && !!submission.analysis && !running;
  const recipients = result?.recipientIds.map(id => profiles.find(profile => profile.id === id)).filter((profile): profile is RecipientProfile => !!profile) || [];

  async function startReview() {
    if (!canReview) return;
    setRequesting(true);
    setRequestError('');
    try {
      await reviewWithTinfoil(session, submission.id);
      await onUpdated();
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'The review could not start. Try again.');
    } finally {
      setRequesting(false);
    }
  }

  if (!configured && !review) return null;
  return <section className="desk-tinfoil-review" aria-label="Tinfoil review">
    <div className="desk-tinfoil-heading"><div><ShieldCheck size={17} /><h3>Tinfoil review</h3></div>{result && <span className="desk-tinfoil-complete"><Check size={12} />Review complete</span>}</div>
    {!result && <p className="desk-tinfoil-disclosure">Tinfoil receives reviewed text, context, the invoice, and recipient expertise; the photo stays on this laptop.</p>}
    {running ? <div className="desk-tinfoil-progress" role="status"><LoaderCircle className="desk-spin" size={16} /><span>Tinfoil is reviewing the submitted text…</span></div> : result ? <>
      {result.verification?.securityVerified ? <details className="desk-tinfoil-verification"><summary><ShieldCheck size={14} />Inference verified<ChevronRight size={13} /></summary><p>Tinfoil · {result.model} · {(result.durationMs / 1000).toFixed(1)}s</p><p>Verification applies to Tinfoil’s hosted inference service. Application deployment is a separate attestation.</p><dl><dt>Verified at</dt><dd><time dateTime={result.verification.verifiedAt}>{result.verification.verifiedAt}</time></dd><dt>Enclave</dt><dd>{result.verification.enclaveHost}</dd><dt>Configuration</dt><dd>{result.verification.configRepo}</dd><dt>Release digest</dt><dd>{result.verification.releaseDigest}</dd><dt>Code fingerprint</dt><dd>{result.verification.codeFingerprint}</dd><dt>Enclave fingerprint</dt><dd>{result.verification.enclaveFingerprint}</dd></dl></details> : <details className="desk-details"><summary>Review details</summary><p>Tinfoil · {result.model} · {(result.durationMs / 1000).toFixed(1)}s</p></details>}
      <h4>Questions to investigate</h4>
      <ol className="desk-tinfoil-questions">{result.openQuestions.map((question, index) => <li key={index}>{question}</li>)}</ol>
      <h4>Suggested recipient</h4>
      {recipients.length ? <div className="desk-tinfoil-recipients">{recipients.map(profile => <button key={profile.id} onClick={() => onProfile(profile)}><span><strong>{profile.name}</strong><span>{profile.publication}</span></span><ArrowUpRight size={14} /></button>)}</div> : <p className="desk-tinfoil-note">No recipient selected.</p>}
      <div className="desk-tinfoil-sources"><span>Sources</span><div>{result.citations.map((citation, index) => <button className="desk-source-button" key={`${citation.documentId}-${index}`} onClick={() => onCitation(citation)}><FileText size={13} /><span>{citation.title || citation.documentId}</span><ArrowUpRight size={12} /></button>)}</div></div>
    </> : <>
      {failure && <p className="desk-tinfoil-error" role="alert">{failure}</p>}
      <button className="desk-secondary" onClick={() => void startReview()} disabled={!canReview}>{failure ? <RefreshCw size={14} /> : <ShieldCheck size={14} />}{failure ? 'Retry Tinfoil review' : 'Review with Tinfoil'}<ArrowUpRight size={13} /></button>
      {!configured && <p className="desk-tinfoil-note">Tinfoil is currently unavailable.</p>}
    </>}
  </section>;
}
