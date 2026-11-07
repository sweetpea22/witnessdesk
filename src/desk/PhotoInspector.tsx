import { useEffect, useState } from 'react';
import { CircleHelp, LoaderCircle, RefreshCw, X } from 'lucide-react';
import { readPhoto } from '../shared/api';
import type { DeskSession, PhotoDescription } from '../shared/contracts';

type PhotoInspectorProps = {
  session: DeskSession;
  photo: PhotoDescription;
  contributorAlias: string;
  submittedText: string;
  onClose: () => void;
};

export default function PhotoInspector({ session, photo, contributorAlias, submittedText, onClose }: PhotoInspectorProps) {
  const [dataUrl, setDataUrl] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  // This component mounts only after the desk operator explicitly requests the photo.
  // Keep image bytes in this view's memory, outside polling snapshots and persistence.
  useEffect(() => {
    let active = true;
    setDataUrl('');
    setError('');
    readPhoto(session, photo.id).then(result => {
      if (!/^data:image\/(?:jpeg|png|webp);base64,/i.test(result.dataUrl)) {
        throw new Error('The submitted photo could not be displayed.');
      }
      if (active) setDataUrl(result.dataUrl);
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : 'Could not load the submitted photo.');
    });
    return () => { active = false; };
  }, [session, photo.id, attempt]);

  return <div className="desk-inspector-backdrop desk-photo-backdrop" onClick={onClose}>
    <section className="desk-photo-inspector" role="dialog" aria-modal="true" aria-label="Submitted photo evidence" onClick={event => event.stopPropagation()}>
      <button className="desk-modal-close" onClick={onClose} aria-label="Close submitted photo"><X size={19} /></button>
      <div className="desk-photo-preview">
        {dataUrl ? <img src={dataUrl} alt={`Photo submitted by ${contributorAlias || 'contributor'}`} /> : error ? <div className="desk-photo-loading" role="alert"><CircleHelp size={28} /><p>{error}</p><button className="desk-secondary" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={14} />Retry photo</button></div> : <div className="desk-photo-loading" role="status"><LoaderCircle className="desk-spin" size={28} /><p>Loading submitted photo…</p></div>}
      </div>
      <div className="desk-photo-details">
        <h2>Submitted photo</h2>
        <p className="desk-model-label">Photo OCR · Ollama · <strong>{photo.model}</strong></p>
        <details className="desk-details"><summary>Photo details</summary><p>Ollama · {photo.model} · {(photo.durationMs / 1000).toFixed(1)}s</p><p>Image authenticity is unverified. The comparison uses the sender-reviewed text below.</p></details>
        <section className="desk-photo-section"><h3>Model description · unverified</h3><p>{photo.description || 'The model did not return a description.'}</p></section>
        <section className="desk-photo-section"><h3>Model uncertainty notes</h3>{photo.uncertainties.length ? <ul>{photo.uncertainties.map((note, index) => <li key={index}>{note}</li>)}</ul> : <p>None reported.</p>}</section>
        <section className="desk-photo-section"><h3>Text the model read · unverified</h3><pre>{photo.extractedText || 'No text extracted.'}</pre></section>
        <section className="desk-photo-section desk-photo-reviewed"><h3>Text submitted after review</h3><pre>{submittedText}</pre></section>
      </div>
    </section>
  </div>;
}
