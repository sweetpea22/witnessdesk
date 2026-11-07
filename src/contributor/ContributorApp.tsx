import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCheck, ChevronDown, CircleHelp, FileText, Fingerprint, LoaderCircle, LockKeyhole, Send, ShieldCheck } from 'lucide-react';
import { ensureDeskSession, getProviderStatus, submitTip } from '../shared/api';
import { DEMO_ALIAS, DEMO_CONTEXT, DEMO_EVIDENCE, type ProviderStatus, type Receipt, type Tip } from '../shared/contracts';
import './contributor.css';

type Pairing = { sessionId: string; senderCapability: string };
type Stage = 'compose' | 'review' | 'received';
const PAIR_KEY = 'witness-contributor-pair';

function freshId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getPairFromLocation(): Pairing | null {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const sessionId = hash.get('session');
  const senderCapability = hash.get('sender');
  if (sessionId && senderCapability) {
    const pair = { sessionId, senderCapability };
    sessionStorage.setItem(PAIR_KEY, JSON.stringify(pair));
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return pair;
  }
  try {
    const saved = sessionStorage.getItem(PAIR_KEY);
    if (!saved) return null;
    const pair = JSON.parse(saved);
    return typeof pair.sessionId === 'string' && typeof pair.senderCapability === 'string' ? pair : null;
  } catch { return null; }
}

function displayTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export default function ContributorApp() {
  const [stage, setStage] = useState<Stage>('compose');
  const [alias, setAlias] = useState(DEMO_ALIAS);
  const [evidence, setEvidence] = useState('');
  const [context, setContext] = useState('');
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [sending, setSending] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState('');
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const pending = useRef<{ signature: string; id: string } | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    let connectionAttempt = 0;
    async function connect() {
      const attempt = ++connectionAttempt;
      setConnecting(true);
      setError('');
      try {
        let pair = getPairFromLocation();
        if (new URLSearchParams(window.location.search).get('demo') === '1') {
          const desk = await ensureDeskSession();
          pair = { sessionId: desk.sessionId, senderCapability: desk.senderCapability };
          sessionStorage.setItem(PAIR_KEY, JSON.stringify(pair));
        }
        if (!cancelled && attempt === connectionAttempt) setPairing(pair);
        const providerStatus = await getProviderStatus();
        if (!cancelled && attempt === connectionAttempt) setStatus(providerStatus);
      } catch (cause) {
        if (!cancelled && attempt === connectionAttempt) setError(cause instanceof Error ? cause.message : 'Could not reach the desk. Please try again.');
      } finally { if (!cancelled && attempt === connectionAttempt) setConnecting(false); }
    }
    function reconnect() {
      if (!window.location.hash) return;
      pending.current = null;
      setReceipt(null);
      setStage('compose');
      void connect();
    }
    window.addEventListener('hashchange', reconnect);
    void connect();
    return () => { cancelled = true; window.removeEventListener('hashchange', reconnect); };
  }, []);

  const tip: Tip = { contributorAlias: alias.trim() || 'Contributor', evidenceText: evidence.trim(), ...(context.trim() ? { contextNote: context.trim() } : {}) };
  const canReview = !!pairing && !!tip.evidenceText && tip.evidenceText.length <= 8000 && context.length <= 2000;
  const isConfidential = status?.mode === 'tinfoil-container';
  const modelLabel = status?.analysisProvider === 'tinfoil' ? 'Tinfoil confidential inference' : status?.analysisProvider === 'ollama' ? 'Ollama on the desk computer' : 'A labeled demonstration processor';

  function moveTo(next: Stage) {
    setStage(next);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
  }

  function loadExample() {
    setAlias(DEMO_ALIAS);
    setEvidence(DEMO_EVIDENCE);
    setContext(DEMO_CONTEXT);
    setError('');
  }

  async function send() {
    if (!pairing || sending) return;
    const signature = JSON.stringify(tip);
    if (!pending.current || pending.current.signature !== signature) pending.current = { signature, id: freshId() };
    setSending(true);
    setError('');
    try {
      const result = await submitTip(pairing.sessionId, pairing.senderCapability, pending.current.id, tip);
      setReceipt(result);
      moveTo('received');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The desk could not confirm receipt. Your draft is still here. Retry safely.');
    } finally { setSending(false); }
  }

  function newTip() {
    setEvidence(''); setContext(''); setReceipt(null); pending.current = null; moveTo('compose');
  }

  return <div className="contributor-app">
    <header className="contributor-header">
      <a href="/contribute" className="contributor-wordmark" aria-label="Witness Desk contributor"><span className="contributor-brand-icon"><FileText size={18} strokeWidth={1.6}/></span> witness<span className="contributor-brand-dot">.</span></a>
      <span className="contributor-edition">CONTRIBUTOR DESK</span>
    </header>

    <main className="contributor-main" ref={mainRef} tabIndex={-1}>
      <div className="contributor-connection"><span className={`contributor-status-dot ${pairing && status ? 'contributor-status-connected' : ''}`}/>{connecting ? 'Connecting to your desk' : pairing && status ? 'Connected to Witness Desk' : pairing ? 'Desk paired · connection unavailable' : 'Waiting for a desk connection'}</div>

      {stage !== 'received' && <>
        <div className="contributor-eyebrow">A PLACE FOR THE RECORD</div>
        <h1>{stage === 'compose' ? <>Something doesn’t<br/>add up.</> : <>Your story.<br/>Your decision.</>}</h1>
        <p className="contributor-intro">{stage === 'compose' ? 'Share what you know. Help a journalist find the questions worth asking.' : 'Take a moment to review exactly what the investigative desk will receive.'}</p>

        <ol className="contributor-steps" aria-label="Submission progress">
          {['Compose', 'Review', 'Received'].map((label, index) => <li key={label} className={(stage === 'compose' ? 0 : 1) === index ? 'contributor-step-active' : (stage === 'compose' ? 0 : 1) > index ? 'contributor-step-done' : ''}><span>{(stage === 'compose' ? 0 : 1) > index ? <Check size={12}/> : index + 1}</span>{label}</li>)}
        </ol>
      </>}

      {!connecting && !pairing && <div className="contributor-notice contributor-error" role="alert"><CircleHelp size={18}/><div><strong>Start with the desk’s QR code</strong><p>Scan the contributor QR displayed on your laptop. It connects your submission to that desk.</p><a href="/contribute?demo=1">Open the fictional demo instead <ArrowRight size={13}/></a></div></div>}

      {stage === 'compose' && <form className="contributor-form" onSubmit={event => { event.preventDefault(); if (canReview) moveTo('review'); }}>
        <div className="contributor-example">
          <span className="contributor-example-icon"><FileText size={21} strokeWidth={1.5}/></span>
          <div><strong>Cindy’s payment record</strong><span>$120k invoiced. $350k sent.</span></div>
          <button type="button" onClick={loadExample}>Load demo <ArrowRight size={14}/></button>
        </div>

        <label className="contributor-field"><span className="contributor-label">Your alias <span>optional</span></span><input autoComplete="off" name="alias" value={alias} onChange={event => setAlias(event.target.value)} maxLength={80} placeholder="An alias, not your legal name"/><span className="contributor-hint">Cindy is the contributor in this fictional demo.</span></label>

        <label className="contributor-field"><span className="contributor-label">The evidence <span>required</span></span><textarea className="contributor-evidence-input" name="evidence" value={evidence} onChange={event => setEvidence(event.target.value)} maxLength={8000} required placeholder={'Paste the record you want someone to investigate.\n\nAn invoice, payment confirmation, or internal note…'}/><span className="contributor-counter">{evidence.length.toLocaleString()} / 8,000 characters</span></label>

        <label className="contributor-field"><span className="contributor-label">What should we know? <span>optional</span></span><textarea className="contributor-context-input" name="context" value={context} onChange={event => setContext(event.target.value)} maxLength={2000} placeholder="Explain what concerns you. Leave out details you don’t want to share."/><span className="contributor-hint">This context will also be shared with the desk.</span></label>

        {error && <div role="alert" className="contributor-notice contributor-error"><CircleHelp size={17}/><p>{error}</p></div>}
        <button className="contributor-primary" type="submit" disabled={!canReview || connecting}>Review your submission <ArrowRight size={18}/></button>
        <p className="contributor-under-button">Nothing is sent until you confirm.</p>
      </form>}

      {stage === 'review' && <div className="contributor-review">
        <div className="contributor-review-heading"><span>SUBMITTING AS</span><strong><Fingerprint size={17}/>{tip.contributorAlias}</strong></div>
        <section className="contributor-document"><div className="contributor-document-label"><FileText size={15}/><span>YOUR EVIDENCE</span><span>TEXT RECORD</span></div><pre>{tip.evidenceText}</pre></section>
        {tip.contextNote && <section className="contributor-review-context"><h2>Your context</h2><p>{tip.contextNote}</p></section>}
        <div className="contributor-share-note"><LockKeyhole size={19}/><p>The investigative desk can read this submission. Its AI will compare the record with the invoice and suggest relevant reporting expertise.</p></div>
        {error && <div role="alert" className="contributor-notice contributor-error"><CircleHelp size={17}/><div><p>{error}</p><p>Your draft is preserved. Retrying this submission will use the same receipt ID.</p></div></div>}
        <button className="contributor-primary" disabled={sending || !pairing} onClick={() => void send()}>{sending ? <><LoaderCircle className="contributor-spin" size={18}/> Sending to the desk</> : <>Send to Witness Desk <Send size={17}/></>}</button>
        <button className="contributor-back" disabled={sending} onClick={() => moveTo('compose')}><ArrowLeft size={15}/> Keep editing</button>
      </div>}

      {stage === 'received' && receipt && <div className="contributor-received" aria-live="polite">
        <div className="contributor-received-mark"><CheckCheck size={32} strokeWidth={1.5}/></div>
        <div className="contributor-eyebrow">THE RECORD IS RECEIVED</div>
        <h1>Thank you,<br/>{tip.contributorAlias}.</h1>
        <p className="contributor-intro">Your submission is with the desk. The next step is understanding what the evidence supports.</p>
        <div className="contributor-receipt">
          <div className="contributor-receipt-top"><FileText size={18}/><span>Submission receipt</span><span className="contributor-receipt-chip">Received</span></div>
          <dl><div><dt>Reference</dt><dd>{receipt.submissionId.slice(0, 8).toUpperCase()}</dd></div><div><dt>Received</dt><dd>{displayTime(receipt.receivedAt)}</dd></div><div><dt>Shared with</dt><dd>Witness Desk</dd></div></dl>
          <p>This confirms delivery, not verification of the claims.</p>
        </div>
        <div className="contributor-next"><span>01</span><div><strong>The desk reviews the record</strong><p>Evidence is compared with the original invoice.</p></div></div>
        <div className="contributor-next"><span>02</span><div><strong>A lead takes shape</strong><p>Supported findings and relevant reporter profiles appear on the laptop.</p></div></div>
        <button className="contributor-secondary" onClick={newTip}>Prepare another submission <ArrowRight size={16}/></button>
      </div>}

      <section className="contributor-privacy">
        <button type="button" aria-expanded={privacyOpen} onClick={() => setPrivacyOpen(value => !value)}><ShieldCheck size={17}/><span>{status ? isConfidential ? 'Tinfoil Container · privacy details' : 'Local prototype · privacy details' : 'About this desk’s privacy'}</span><ChevronDown size={16} className={privacyOpen ? 'contributor-chevron-open' : ''}/></button>
        {privacyOpen && <div className="contributor-privacy-body"><p><strong>{isConfidential ? 'Tinfoil Container mode' : 'Local prototype'}</strong>{isConfidential ? ' — the app verifies the confidential connection when you send.' : ' — this is not a deployed confidential enclave. Submission contents are encrypted for the desk computer.'}</p><p>Analysis: {status ? modelLabel : 'connection status unavailable'}.</p><p>Your intended desk operator can read the submitted evidence and context. Network metadata and your device are outside this demo’s protection. This is not a guarantee of source anonymity.</p></div>}
      </section>
    </main>
    <footer className="contributor-footer"><span>WITNESS DESK</span><span>Fictional evidence. Real questions.</span></footer>
  </div>;
}
