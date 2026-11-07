import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, CircleHelp, ImagePlus, LoaderCircle, Send, Sparkles, X } from 'lucide-react';
import { describePhoto, ensureDeskSession, getProviderStatus, submitTip } from '../shared/api';
import { DEMO_ALIAS, type PhotoDescription, type Receipt, type Tip } from '../shared/contracts';
import { preparePhoto, type PreparedPhoto } from './preparePhoto';
import './contributor.css';

type Pairing = { sessionId: string; senderCapability: string };
type Stage = 'compose' | 'review' | 'received';
type PhotoDraft = PreparedPhoto & { requestId: string };
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
  const [evidence, setEvidence] = useState('');
  const [context, setContext] = useState('');
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [sending, setSending] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState<PhotoDraft | null>(null);
  const [photoDescription, setPhotoDescription] = useState<PhotoDescription | null>(null);
  const [photoBusy, setPhotoBusy] = useState<'preparing' | 'describing' | null>(null);
  const [photoError, setPhotoError] = useState('');
  const [extractionApplied, setExtractionApplied] = useState(false);
  const photoVersion = useRef(0);
  const photoOperation = useRef<'preparing' | 'describing' | null>(null);
  const evidenceValue = useRef('');
  const evidenceRevision = useRef(0);
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
        await getProviderStatus();
      } catch (cause) {
        if (!cancelled && attempt === connectionAttempt) setError(cause instanceof Error ? cause.message : 'Could not reach the desk. Please try again.');
      } finally { if (!cancelled && attempt === connectionAttempt) setConnecting(false); }
    }
    function reconnect() {
      if (!window.location.hash) return;
      pending.current = null;
      clearPhoto();
      setReceipt(null);
      setStage('compose');
      void connect();
    }
    window.addEventListener('hashchange', reconnect);
    void connect();
    return () => { cancelled = true; photoVersion.current++; window.removeEventListener('hashchange', reconnect); };
  }, []);

  const tip: Tip = { contributorAlias: DEMO_ALIAS, evidenceText: evidence.trim(), ...(context.trim() ? { contextNote: context.trim() } : {}), ...(photoDescription ? { photoId: photoDescription.id } : {}) };
  const canReview = !!pairing && !!tip.evidenceText && tip.evidenceText.length <= 8000 && context.length <= 2000 && !photoBusy && (!photo || !!photoDescription);

  function moveTo(next: Stage) {
    setStage(next);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
  }

  function updateEvidence(value: string) {
    evidenceValue.current = value;
    evidenceRevision.current++;
    setEvidence(value);
  }

  function clearPhoto() {
    photoVersion.current++;
    photoOperation.current = null;
    setPhoto(null);
    setPhotoDescription(null);
    setPhotoBusy(null);
    setPhotoError('');
    setExtractionApplied(false);
  }

  async function choosePhoto(file: File | undefined) {
    if (!file) return;
    clearPhoto();
    const version = photoVersion.current;
    photoOperation.current = 'preparing';
    setPhotoBusy('preparing');
    try {
      const prepared = await preparePhoto(file);
      if (photoVersion.current !== version) return;
      setPhoto({ ...prepared, requestId: freshId() });
    } catch (cause) {
      if (photoVersion.current === version) setPhotoError(cause instanceof Error ? cause.message : 'This photo could not be opened. Try a JPEG or enter the evidence as text.');
    } finally {
      if (photoVersion.current === version) { photoOperation.current = null; setPhotoBusy(null); }
    }
  }

  async function describeSelectedPhoto() {
    if (!photo || !pairing || photoOperation.current) return;
    const version = photoVersion.current;
    const revision = evidenceRevision.current;
    const hadEvidence = !!evidenceValue.current.trim();
    photoOperation.current = 'describing';
    setPhotoBusy('describing');
    setPhotoError('');
    try {
      const result = await describePhoto(pairing.sessionId, pairing.senderCapability, photo.requestId, photo.dataUrl);
      if (photoVersion.current !== version) return;
      setPhotoDescription(result);
      if (!hadEvidence && evidenceRevision.current === revision && result.extractedText.trim()) {
        updateEvidence(result.extractedText);
        setExtractionApplied(true);
      }
    } catch (cause) {
      if (photoVersion.current === version) setPhotoError(cause instanceof Error ? cause.message : 'The laptop could not describe this photo. Your selected photo is still here; try again.');
    } finally {
      if (photoVersion.current === version) { photoOperation.current = null; setPhotoBusy(null); }
    }
  }

  function usePhotoText() {
    if (!photoDescription) return;
    updateEvidence(photoDescription.extractedText.trim() ? photoDescription.extractedText : photoDescription.description);
    setExtractionApplied(true);
  }

  async function send() {
    if (!pairing || sending || !canReview) return;
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
    clearPhoto(); updateEvidence(''); setContext(''); setReceipt(null); pending.current = null; moveTo('compose');
  }

  return <div className="contributor-app">
    <header className="contributor-header">
      <h1>What are you witnessing?</h1>
    </header>

    <main className="contributor-main" ref={mainRef} tabIndex={-1}>
      {connecting && <p className="contributor-status" role="status">Connecting…</p>}
      {!connecting && !pairing && <div className="contributor-notice contributor-error" role="alert"><CircleHelp size={17}/><p>Scan the desk’s QR code to connect.</p></div>}

      {stage === 'compose' && <form className="contributor-form" aria-busy={connecting} onSubmit={event => { event.preventDefault(); if (canReview) moveTo('review'); }}>
        <section className="contributor-photo-section" aria-label="Photo">
          <div className="contributor-label">Photo</div>
          <div className="contributor-photo-choices">
            <label className="contributor-photo-choice contributor-photo-camera"><Camera size={18}/><span>Take a photo</span><input type="file" accept="image/*" capture="environment" aria-label="Take a photo" onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void choosePhoto(file); }}/></label>
            <label className="contributor-photo-choice"><ImagePlus size={18}/><span>Choose photo</span><input type="file" accept="image/*" aria-label="Choose photo" onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void choosePhoto(file); }}/></label>
          </div>
          {photoBusy === 'preparing' && <p className="contributor-status" role="status"><LoaderCircle size={15} className="contributor-spin"/>Preparing photo…</p>}
          {photo && <div className="contributor-photo-preview">
            <div className="contributor-photo-image"><img src={photo.dataUrl} alt="Selected evidence photo"/><button type="button" onClick={clearPhoto} aria-label="Remove photo"><X size={18}/></button></div>
            {!photoDescription && <button type="button" className="contributor-photo-describe" onClick={() => void describeSelectedPhoto()} disabled={!!photoBusy || !pairing || connecting}>{photoBusy === 'describing' ? <><LoaderCircle size={16} className="contributor-spin"/>Describing…</> : <><Sparkles size={16}/>{photoError ? 'Retry description' : 'Describe on laptop'}</>}</button>}
          </div>}
          {photoError && <div className="contributor-notice contributor-error" role="alert"><CircleHelp size={17}/><p>{photoError}</p></div>}
          {photoDescription && <div className="contributor-photo-description" aria-live="polite">
            <h2>Description</h2><p>{photoDescription.description}</p>
            {photoDescription.uncertainties.length > 0 && <details><summary>Unclear details</summary><ul>{photoDescription.uncertainties.map((uncertainty, index) => <li key={index}>{uncertainty}</li>)}</ul></details>}
            {!extractionApplied && <div className="contributor-photo-apply">{photoDescription.extractedText.trim() && <details><summary>Extracted text</summary><pre>{photoDescription.extractedText}</pre></details>}<button type="button" onClick={usePhotoText}>{photoDescription.extractedText.trim() ? 'Replace evidence with extracted text' : 'Use description as evidence'}<ArrowRight size={14}/></button></div>}
          </div>}
        </section>

        <label className="contributor-field"><span className="contributor-label">Evidence</span><textarea className="contributor-evidence-input" name="evidence" value={evidence} onChange={event => updateEvidence(event.target.value)} maxLength={8000} required placeholder="Add text or describe a photo above."/>{evidence.length > 8000 && <span className="contributor-status">Limit: 8,000 characters.</span>}</label>
        <label className="contributor-field"><span className="contributor-label">Context <span>optional</span></span><textarea className="contributor-context-input" name="context" value={context} onChange={event => setContext(event.target.value)} maxLength={2000}/></label>
        {error && <div role="alert" className="contributor-notice contributor-error"><CircleHelp size={17}/><p>{error}</p></div>}
        <button className="contributor-primary" type="submit" disabled={!canReview || connecting}>Review <ArrowRight size={18}/></button>
      </form>}

      {stage === 'review' && <div className="contributor-review">
        <h2>Review</h2>
        {photo && photoDescription && <section className="contributor-review-photo"><img src={photo.dataUrl} alt="Evidence photo attached to this submission"/><p>{photoDescription.description}</p></section>}
        <section className="contributor-document"><h3>Evidence</h3><pre>{tip.evidenceText}</pre></section>
        {tip.contextNote && <section className="contributor-review-context"><h3>Context</h3><p>{tip.contextNote}</p></section>}
        {error && <div role="alert" className="contributor-notice contributor-error"><CircleHelp size={17}/><div><p>{error}</p><p>Please try again.</p></div></div>}
        <button className="contributor-primary" disabled={sending || !pairing} onClick={() => void send()}>{sending ? <><LoaderCircle className="contributor-spin" size={18}/>Sending…</> : <>Send <Send size={17}/></>}</button>
        <button className="contributor-back" disabled={sending} onClick={() => moveTo('compose')}><ArrowLeft size={15}/> Back</button>
      </div>}

      {stage === 'received' && receipt && <div className="contributor-received" aria-live="polite">
        <h2>Received</h2>
        <div className="contributor-receipt"><dl><div><dt>Reference</dt><dd>{receipt.submissionId.slice(0, 8).toUpperCase()}</dd></div><div><dt>Received</dt><dd>{displayTime(receipt.receivedAt)}</dd></div></dl></div>
        <button className="contributor-secondary" onClick={newTip}>New submission <ArrowRight size={16}/></button>
      </div>}
    </main>
  </div>;
}
