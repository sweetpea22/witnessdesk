import { useCallback, useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, BookOpen, Camera, Check, ChevronRight, CircleHelp, FileText, Fingerprint, GitBranch, Inbox, LoaderCircle, LockKeyhole, Network, RefreshCw, RotateCcw, Search, ShieldCheck, Smartphone, Sparkles, X } from 'lucide-react';
import { contributorUrl, ensureDeskSession, getProviderStatus, prepareRecipients, readDesk, resetDesk, retryAnalysis } from '../shared/api';
import { INVOICE_TEXT } from '../shared/contracts';
import type { Analysis, Citation, DeskSession, DeskSnapshot, GraphNode, RecipientGraph, RecipientProfile, RecipientSource, Submission } from '../shared/contracts';
import './desk.css';
import PhotoInspector from './PhotoInspector';

const money = (n: number | null | undefined) => n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const shortTime = (s: string) => new Date(s).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const initials = (s: string) => s.split(' ').map(v => v[0]).slice(0, 2).join('').toUpperCase();
const providerName = (s?: string) => s === 'ollama' ? 'Ollama · on this computer' : s === 'darkbloom' ? 'Darkbloom' : s === 'tinfoil' ? 'Tinfoil' : s === 'fixture' || s === 'deterministic-demo' ? 'Demo fixture' : s || 'Not prepared';

function resultLabels(analysis?: Analysis) {
  if (!analysis) return { inbox: 'Payment record to review', heading: 'Review the payment record', difference: 'DIFFERENCE', note: 'Awaiting analysis' };
  if (analysis.kind === 'insufficient_evidence' || analysis.difference == null) return { inbox: 'Payment needs more evidence', heading: 'More evidence needed', difference: 'DIFFERENCE', note: 'No conclusion yet' };
  if (analysis.kind === 'possible_overpayment' && analysis.difference > 0) return { inbox: 'Payment exceeds invoice', heading: 'The payment gap', difference: 'POTENTIAL DIFFERENCE', note: 'Needs explanation' };
  if (analysis.difference === 0) return { inbox: 'Payment matches invoice', heading: 'No payment gap shown', difference: 'DIFFERENCE', note: 'Amounts match' };
  if (analysis.difference < 0) return { inbox: 'Payment is below invoice', heading: 'Payment below invoiced amount', difference: 'DIFFERENCE', note: 'No overpayment shown' };
  return { inbox: 'Payment record to review', heading: 'Review the payment record', difference: 'DIFFERENCE', note: 'No conclusion yet' };
}

type Inspected = { title: string; label: string; text: string; quote?: string; sourceId?: string };

function SourceButton({ citation, onClick }: { citation: Citation; onClick: () => void }) {
  return <button className="desk-source-button" onClick={onClick}><FileText size={13} /><span>{citation.title || citation.documentId}</span><ArrowUpRight size={12} /></button>;
}

function ProfileCard({ profile, recommended, onSelect }: { profile: RecipientProfile; recommended?: boolean; onSelect: () => void }) {
  return <button className={`desk-profile ${recommended ? 'is-recommended' : ''}`} onClick={onSelect}>
    <span className="desk-avatar">{initials(profile.name)}</span>
    <span className="desk-profile-body"><strong>{profile.name}</strong><span>{profile.publication}</span><span className="desk-profile-tags">{profile.specialties.slice(0, 2).join(' · ')}</span></span>
    <ChevronRight size={15} />
  </button>;
}

function ProvenanceGraph({ graph, onNode }: { graph: RecipientGraph; onNode: (node: GraphNode) => void }) {
  const grouped = { article: [] as GraphNode[], topic: [] as GraphNode[], recipient: [] as GraphNode[], region: [] as GraphNode[] };
  graph.nodes.forEach(node => grouped[node.type]?.push(node));
  const middle = [...grouped.topic, ...grouped.region];
  const maxRows = Math.max(grouped.article.length, middle.length, grouped.recipient.length, 3);
  const height = Math.max(360, maxRows * 62 + 70);
  const position = new Map<string, { x: number; y: number }>();
  const layout = (nodes: GraphNode[], x: number) => nodes.forEach((node, i) => position.set(node.id, { x, y: 62 + (i + .5) * ((height - 100) / Math.max(nodes.length, 1)) }));
  layout(grouped.article, 150); layout(middle, 450); layout(grouped.recipient, 750);
  if (!graph.nodes.length) return <div className="desk-graph-empty"><GitBranch size={32} /><h3>A network with a paper trail.</h3><p>Prepare recipient profiles to connect reporting sources, topics, and people.</p></div>;
  return <svg className="desk-graph" viewBox={`0 0 900 ${height}`} role="img" aria-label="Recipient graph with clickable source documents, extracted topics, and reporters">
    <text x="150" y="25" className="desk-graph-column">SOURCE DOCUMENTS</text><text x="450" y="25" className="desk-graph-column">EXTRACTED CONTEXT</text><text x="750" y="25" className="desk-graph-column">RECIPIENTS</text>
    {graph.edges.map((edge, i) => { const a = position.get(edge.source), b = position.get(edge.target); if (!a || !b) return null; return <path key={`${edge.source}-${edge.target}-${i}`} d={`M ${a.x} ${a.y} C ${(a.x + b.x) / 2} ${a.y}, ${(a.x + b.x) / 2} ${b.y}, ${b.x} ${b.y}`} className="desk-graph-edge"><title>{edge.label}</title></path>; })}
    {graph.nodes.map(node => { const p = position.get(node.id); if (!p) return null; const isRecipient = node.type === 'recipient'; return <g key={node.id} transform={`translate(${p.x},${p.y})`} className={`desk-graph-node node-${node.type}`} role="button" tabIndex={0} onClick={() => onNode(node)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNode(node); } }} aria-label={`Inspect ${node.label}`}>
      <rect x="-122" y="-20" width="244" height="40" rx={isRecipient ? 20 : 7} /><circle cx="-104" cy="0" r="3" /><text x="-92" y="5">{node.label.length > 29 ? node.label.slice(0, 27) + '…' : node.label}</text><title>{node.label}</title>
    </g>; })}
  </svg>;
}

export default function DeskApp() {
  const [session, setSession] = useState<DeskSession | null>(null);
  const [snapshot, setSnapshot] = useState<DeskSnapshot | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'evidence' | 'network'>('evidence');
  const [error, setError] = useState('');
  const [pairOpen, setPairOpen] = useState(false);
  const [inspected, setInspected] = useState<Inspected | null>(null);
  const [activeProfile, setActiveProfile] = useState<RecipientProfile | null>(null);
  const [photoSubmission, setPhotoSubmission] = useState<Submission | null>(null);
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState('');

  const connectDesk = useCallback(async () => { try { const [s] = await Promise.all([ensureDeskSession(), getProviderStatus().catch(() => undefined)]); setSession(s); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Could not open the desk.'); } }, []);
  useEffect(() => { void connectDesk(); }, [connectDesk]);
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPairOpen(false); setInspected(null); setActiveProfile(null); setPhotoSubmission(null); } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, []);
  const refresh = useCallback(async () => { if (!session) return; try { const data = await readDesk(session); setSnapshot(data); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Connection interrupted.'); } }, [session]);
  useEffect(() => { if (!session) return; void refresh(); const timer = window.setInterval(() => void refresh(), 2000); return () => clearInterval(timer); }, [session, refresh]);
  const submissions = snapshot?.submissions || [];
  const selected = submissions.find(s => s.id === selectedId) || submissions[0];
  const selectedLabels = resultLabels(selected?.analysis);
  const profiles = snapshot?.recipients || [];
  const status = snapshot?.status;
  const prep = status?.preparation;
  const filteredProfiles = profiles.filter(p => `${p.name} ${p.publication} ${p.specialties.join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  const sources = useMemo(() => [...new Map(profiles.flatMap(p => p.sources).map(s => [s.id, s])).values()], [profiles]);
  const pairedUrl = session ? contributorUrl(session) : '';
  const connected = !!snapshot && !error;

  const inspectSource = (source: RecipientSource, quote?: string) => { setInspected({ title: source.title, label: source.kind === 'public-web' ? 'Public reporting source' : 'Fictional source document', text: source.text, quote, sourceId: source.id }); };
  const inspectCitation = (citation: Citation, submission?: Submission) => {
    const source = sources.find(s => s.id === citation.documentId);
    if (source) { inspectSource(source, citation.quote); return; }
    const isInvoice = citation.documentId === 'invoice-inv204';
    setInspected({ title: citation.title, label: 'Evidence excerpt · fictional record', text: isInvoice ? INVOICE_TEXT : submission?.tip.evidenceText || citation.quote, quote: citation.quote, sourceId: citation.documentId });
  };
  const buildProfiles = async (provider: 'ollama' | 'darkbloom') => { if (!session) return; setBusy(provider); setError(''); try { await prepareRecipients(session, provider); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Preparation failed.'); } finally { setBusy(''); } };
  const retry = async () => { if (!session || !selected) return; setBusy('retry'); try { await retryAnalysis(session, selected.id); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Retry failed.'); } finally { setBusy(''); } };
  const reset = async () => { if (!session || !window.confirm('Clear this demo desk and rotate the phone submission link?')) return; setBusy('reset'); try { const next = await resetDesk(session); setSession(next); setSelectedId(null); setSnapshot(null); setInspected(null); setActiveProfile(null); setPhotoSubmission(null); } catch (e) { setError(e instanceof Error ? e.message : 'Reset failed.'); } finally { setBusy(''); } };
  const copyLink = async () => { try { await navigator.clipboard.writeText(pairedUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setError('Copy is unavailable here. Open the contributor link or scan the code.'); } };
  const nodeSelected = (node: GraphNode) => {
    const profile = profiles.find(p => p.id === node.id || `recipient:${p.id}` === node.id);
    if (profile) { setActiveProfile(profile); return; }
    const source = sources.find(s => s.id === node.id || `article:${s.id}` === node.id || `source:${s.id}` === node.id);
    if (source) { inspectSource(source); return; }
    const edges = snapshot?.graph.edges.filter(e => e.source === node.id || e.target === node.id) || [];
    const linkedSources = [...new Set(edges.map(e => e.sourceDocumentId).filter(Boolean))].map(id => sources.find(s => s.id === id)).filter(Boolean) as RecipientSource[];
    setInspected({ title: node.label, label: `${node.type === 'region' ? 'Regional context' : 'Extracted topic'} · source-backed connection`, text: linkedSources.length ? linkedSources.map(s => `${s.title}\n\n${s.text}`).join('\n\n———\n\n') : `This ${node.type} connects ${edges.length} records in the recipient graph. Open a connected recipient to inspect its supporting source documents.` });
  };

  return <div className="desk-app">
    <aside className="desk-rail"><a className="desk-brand" href="/desk" aria-label="Witness Desk"><Fingerprint size={26} /><span>WITNESS<br /><b>DESK</b></span></a><div className="desk-rail-divider" /><button className={tab === 'evidence' ? 'is-active' : ''} onClick={() => setTab('evidence')}><Inbox size={19} /><span>Evidence</span>{submissions.length > 0 && <small>{submissions.length}</small>}</button><button className={tab === 'network' ? 'is-active' : ''} onClick={() => setTab('network')}><Network size={19} /><span>Recipients</span></button><div className="desk-rail-bottom"><span className="desk-demo-mark">DEMO</span><small>Built for<br />the public interest.</small></div></aside>
    <div className="desk-shell">
      <header className="desk-topbar"><div className="desk-breadcrumb">Workspace <ChevronRight size={12} /><strong>{tab === 'evidence' ? 'Evidence desk' : 'Recipient network'}</strong></div><div className="desk-topbar-right"><span className={`desk-connection ${connected ? 'is-connected' : ''}`}><i />{connected ? 'Desk connected' : 'Connecting'}</span><span className="desk-topbar-mode">{status?.mode === 'tinfoil-container' ? 'Tinfoil Container' : 'Local demo'}</span><button className="desk-icon-button" onClick={reset} disabled={!session || busy === 'reset'} title="Reset demo" aria-label="Reset demo"><RotateCcw size={16} /></button></div></header>
      <main className="desk-main">
        <div className="desk-page-heading"><div><div className="desk-eyebrow">PRIVATE INVESTIGATIVE WORKSPACE</div><h1>{tab === 'evidence' ? 'Follow the evidence.' : 'Find the right recipient.'}</h1><p>{tab === 'evidence' ? 'Bring a lead into focus. Keep every finding connected to its source.' : 'A private map of reporting experience, built from traceable sources.'}</p></div><button className="desk-primary" onClick={() => setPairOpen(true)} disabled={!session}><Smartphone size={16} />Connect a phone<ArrowUpRight size={15} /></button></div>
        {error && <div className="desk-error" role="alert"><CircleHelp size={16} /><span>{error}</span><button onClick={() => void (session ? refresh() : connectDesk())}>Retry</button></div>}
        {tab === 'evidence' ? <div className="desk-evidence-layout">
          <section className="desk-inbox"><div className="desk-section-label"><span>INCOMING LEADS</span><span className="desk-count">{submissions.length}</span></div>
            {submissions.length ? submissions.map(sub => <button key={sub.id} className={`desk-inbox-card ${selected?.id === sub.id ? 'is-selected' : ''}`} onClick={() => setSelectedId(sub.id)}><div className="desk-inbox-card-top"><span className="desk-small-avatar">{initials(sub.tip.contributorAlias || 'Source')}</span><span>{sub.tip.contributorAlias || 'Contributor'}</span><time>{shortTime(sub.receivedAt)}</time></div><strong>{resultLabels(sub.analysis).inbox}</strong><p>{sub.tip.contextNote || 'A new record is ready for review.'}</p><div className="desk-inbox-card-bottom"><span className={`desk-state state-${sub.state}`}>{sub.state === 'ready' ? 'Ready to review' : sub.state === 'analyzing' ? 'Analyzing' : sub.state === 'failed' ? 'Needs attention' : 'Received'}</span><ArrowRight size={14} /></div></button>) : <div className="desk-inbox-empty"><Inbox size={24} /><strong>Your next lead starts here.</strong><p>Scan the desk’s QR code with your phone to send the first fictional tip.</p><button className="desk-text-button" onClick={() => setPairOpen(true)}>Open pairing code <ArrowRight size={13} /></button></div>}
            <div className="desk-reference"><div className="desk-reference-icon"><BookOpen size={16} /></div><div><strong>Already on the desk</strong><span>Invoice INV-204 · $120,000</span><button onClick={() => setInspected({ title: 'Invoice INV-204', label: 'Seeded reference · fictional record', text: INVOICE_TEXT })}>Read reference <ArrowUpRight size={11} /></button></div></div>
            <div className="desk-quiet-note"><LockKeyhole size={14} /><span>Sender access is separate from desk access. All records in this demo are fictional.</span></div>
          </section>
          <section className="desk-case-panel">
            {selected ? <><div className="desk-case-heading"><div><span className="desk-eyebrow">CASE K-17 · HARBOR WORKS</span><h2>{selectedLabels.heading}</h2></div><span className="desk-case-tag">Unverified lead</span></div><div className="desk-case-byline">Submitted by <strong>{selected.tip.contributorAlias || 'Contributor'}</strong><span>·</span>{shortTime(selected.receivedAt)}<span>·</span>Fictional demonstration</div>
              {selected.analysis ? <><div className="desk-amount-grid"><div><span>INVOICED</span><strong>{money(selected.analysis.invoiceAmount)}</strong><small>Invoice INV-204</small></div><div><span>SENT</span><strong>{money(selected.analysis.paymentAmount)}</strong><small>Payment confirmation</small></div><div className="desk-amount-gap"><span>{selectedLabels.difference}</span><strong>{money(selected.analysis.difference)}</strong><small>{selectedLabels.note}</small></div></div>
                <div className="desk-finding"><div className="desk-finding-label"><Sparkles size={15} /><span>WHAT THE RECORDS SUGGEST</span></div><p>{selected.analysis.summary}</p><div className="desk-analysis-byline">{providerName(selected.analysis.provider)}<span>·</span>{selected.analysis.model}<span>·</span>{(selected.analysis.durationMs / 1000).toFixed(1)}s</div></div>
                <div className="desk-evidence-title"><h3>Show the evidence</h3><span>{selected.analysis.citations.length} supporting excerpts</span></div><div className="desk-citations">{selected.analysis.citations.map((citation, i) => <div className="desk-citation" key={`${citation.documentId}-${i}`}><div className="desk-citation-number">{String(i + 1).padStart(2, '0')}</div><div><blockquote>{citation.quote}</blockquote><SourceButton citation={citation} onClick={() => inspectCitation(citation, selected)} /></div></div>)}</div>
                <div className="desk-open-question"><CircleHelp size={18} /><div><span>THE NEXT QUESTION</span>{selected.analysis.openQuestions.map((q, i) => <p key={i}>{q}</p>)}</div></div>
              </> : <div className="desk-analysis-wait">{selected.state === 'failed' ? <CircleHelp size={30} /> : <LoaderCircle className="desk-spin" size={30} />}<h3>{selected.state === 'failed' ? 'The evidence is here. Analysis needs a retry.' : 'Reading the records together…'}</h3><p>{selected.error || 'Comparing the payment confirmation with the invoice, while keeping source passages attached.'}</p>{selected.state === 'failed' && <button className="desk-secondary" onClick={retry} disabled={busy === 'retry'}><RefreshCw size={14} />Retry analysis</button>}</div>}
              {selected.photo && <div className="desk-photo-card"><div className="desk-photo-card-icon"><Camera size={22} /></div><div><span className="desk-eyebrow">PHOTO EVIDENCE</span><strong>A photo accompanies this record.</strong><p>Ollama · {selected.photo.model}. The comparison uses the text reviewed and submitted by the sender.</p></div><button className="desk-secondary" onClick={() => { setInspected(null); setActiveProfile(null); setPhotoSubmission(selected); }}>View submitted photo<ArrowUpRight size={13} /></button></div>}
              <details className="desk-original"><summary><FileText size={15} />Original submission<ChevronRight size={14} /></summary><pre>{selected.tip.evidenceText}</pre>{selected.tip.contextNote && <div className="desk-context-note"><strong>Contributor’s context · unverified</strong><p>{selected.tip.contextNote}</p></div>}</details>
            </> : <div className="desk-case-empty"><span className="desk-empty-illustration"><FileText size={44} strokeWidth={1} /><ArrowDownLeft size={22} /></span><div className="desk-eyebrow">FROM A TIP TO A LEAD</div><h2>A clearer picture,<br />one source at a time.</h2><p>The desk will compare Cindy’s payment record with the $120,000 invoice and make the evidence easy to inspect.</p><div className="desk-flow-steps"><span><b>01</b>Receive</span><ChevronRight size={13} /><span><b>02</b>Connect</span><ChevronRight size={13} /><span><b>03</b>Investigate</span></div><button className="desk-secondary" onClick={() => setPairOpen(true)}><Smartphone size={15} />Send the first tip</button></div>}
          </section>
          <aside className="desk-recipient-panel"><div className="desk-section-label"><span>WHO COULD INVESTIGATE?</span><Network size={15} /></div><h3>Experience that fits.</h3><p className="desk-panel-intro">Match the lead to reporting experience. Inspect the sources behind each profile.</p>{profiles.length ? <div className="desk-profile-list">{[...profiles].sort((a, b) => (selected?.analysis?.recipientIds.includes(b.id) ? 1 : 0) - (selected?.analysis?.recipientIds.includes(a.id) ? 1 : 0)).map(p => <ProfileCard key={p.id} profile={p} recommended={selected?.analysis?.recipientIds.includes(p.id)} onSelect={() => setActiveProfile(p)} />)}</div> : <div className="desk-mini-empty"><GitBranch size={25} /><p>Prepare the network from the demo portfolios to see recipient profiles.</p><button className="desk-text-button" onClick={() => setTab('network')}>Build the network <ArrowRight size={13} /></button></div>}<button className="desk-network-link" onClick={() => setTab('network')}>Explore the recipient network<ArrowUpRight size={14} /></button><div className="desk-profile-disclaimer"><ShieldCheck size={17} /><p><strong>Relevant experience, not a trust score.</strong>These are fictional recipients. No tip is sent onward.</p></div><div className="desk-run-summary"><span className="desk-eyebrow">PROFILE PREPARATION</span><strong>{providerName(prep?.provider)}</strong><span>{prep?.state === 'ready' ? `${prep.profileCount} profiles · ${prep.sourceCount} sources` : prep?.state === 'working' ? 'Reading portfolio sources…' : 'Preparation not completed'}</span></div></aside>
        </div> : <section className="desk-network-workspace">
          <div className="desk-network-toolbar"><div><h2>Every connection has a source.</h2><p>Public or fictional portfolios → model extraction → validated profiles → private matching.</p></div><div className="desk-network-actions"><button className="desk-secondary" onClick={() => void buildProfiles('ollama')} disabled={!!busy || prep?.state === 'working' || !session}>{busy === 'ollama' || prep?.state === 'working' ? <LoaderCircle className="desk-spin" size={15} /> : <Sparkles size={15} />}Build with local model</button>{status?.darkbloomConfigured && <button className="desk-secondary" onClick={() => void buildProfiles('darkbloom')} disabled={!!busy || prep?.state === 'working'}>Use Darkbloom<ArrowUpRight size={14} /></button>}</div></div>
          <div className="desk-preparation-strip"><span className={`desk-state state-${prep?.state === 'ready' ? 'ready' : prep?.state === 'failed' ? 'failed' : 'received'}`}>{prep?.state?.replace('_', ' ') || 'not started'}</span><strong>{providerName(prep?.provider)}</strong><span>{prep?.model || 'No model selected'}</span><span className="desk-runtime-status"><i className={status?.ollamaAvailable ? 'is-available' : ''} />{status?.ollamaAvailable ? 'Ollama available' : 'Ollama unavailable'}</span><span className="desk-preparation-count">{sources.length} sources · {profiles.length} recipients</span></div>{prep?.error && <div className="desk-error" role="alert">{prep.error}</div>}
          <div className="desk-network-body"><div className="desk-network-canvas"><ProvenanceGraph graph={snapshot?.graph || { nodes: [], edges: [] }} onNode={nodeSelected} /><div className="desk-graph-footer"><span><i className="graph-source" />Source</span><span><i className="graph-topic" />Extracted topic</span><span><i className="graph-recipient" />Recipient</span><small>Click a node to inspect its provenance.</small></div></div><aside className="desk-network-directory"><label className="desk-search"><Search size={15} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a recipient" /></label>{filteredProfiles.map(p => <ProfileCard key={p.id} profile={p} onSelect={() => setActiveProfile(p)} />)}{!filteredProfiles.length && <p className="desk-panel-intro">{profiles.length ? 'No matching recipients.' : 'Recipient profiles appear after preparation.'}</p>}<div className="desk-data-boundary"><LockKeyhole size={17} /><strong>Your tip is not a graph-building input.</strong><p>Preparation uses only the fixed portfolio corpus. Source text and extraction history remain inspectable.</p></div></aside></div>
          <div className="desk-source-library"><div className="desk-section-label"><span>THE SOURCE LIBRARY</span><span>{sources.length} documents</span></div><div className="desk-source-library-grid">{sources.map(source => <button key={source.id} onClick={() => inspectSource(source)}><FileText size={19} /><span><strong>{source.title}</strong><small>{source.kind === 'fictional-demo' ? 'Fictional portfolio source' : 'Public reporting'} · {source.id}</small></span><ArrowUpRight size={14} /></button>)}</div></div>
        </section>}
        <footer className="desk-footer"><span><LockKeyhole size={12} />{status?.mode === 'tinfoil-container' ? 'Confidential backend · intended desk reader' : 'Local development · Tinfoil deployment pending'}</span><span>Synthetic evidence. Human judgment.</span></footer>
      </main>
    </div>
    {pairOpen && <div className="desk-modal-backdrop" onClick={() => setPairOpen(false)}><section className="desk-pair-modal" role="dialog" aria-modal="true" aria-labelledby="pair-title" onClick={e => e.stopPropagation()}><button className="desk-modal-close" onClick={() => setPairOpen(false)} aria-label="Close pairing"><X size={19} /></button><div className="desk-eyebrow">CONTRIBUTOR CONNECTION</div><h2 id="pair-title">Your phone. Your story.</h2><p>Scan to open Cindy’s contributor view and send a fictional tip to this desk.</p><div className="desk-qr">{pairedUrl && <QRCodeSVG value={pairedUrl} size={210} bgColor="#ffffff" fgColor="#292820" level="M" />}</div><span className="desk-pair-note">Submission access only · no access to desk records</span><a className="desk-primary" href={pairedUrl} target="_blank" rel="noreferrer">Open contributor view<ArrowUpRight size={15} /></a><button className="desk-text-button" onClick={copyLink}>{copied ? <><Check size={14} />Link copied</> : 'Copy phone link'}</button>{pairedUrl.includes('localhost') && <div className="desk-pair-local-note">This link is local to your computer. A phone needs the shared HTTPS or network address configured by the app.</div>}</section></div>}
    {photoSubmission?.photo && session && <PhotoInspector session={session} photo={photoSubmission.photo} contributorAlias={photoSubmission.tip.contributorAlias} submittedText={photoSubmission.tip.evidenceText} onClose={() => setPhotoSubmission(null)} />}
    {(inspected || activeProfile) && <div className="desk-inspector-backdrop" onClick={() => { setInspected(null); setActiveProfile(null); }}><aside className="desk-inspector" role="dialog" aria-modal="true" aria-label="Source inspector" onClick={e => e.stopPropagation()}><button className="desk-modal-close" onClick={() => { setInspected(null); setActiveProfile(null); }} aria-label="Close source inspector"><X size={19} /></button>{inspected ? <>{activeProfile && <button className="desk-text-button desk-inspector-back" onClick={() => setInspected(null)}>← Back to {activeProfile.name}</button>}<div className="desk-eyebrow">{inspected.label}</div><h2>{inspected.title}</h2>{inspected.sourceId && <span className="desk-source-id">{inspected.sourceId}</span>}{inspected.quote && <div className="desk-inspector-quote"><span>SUPPORTING PASSAGE</span><blockquote>{inspected.quote}</blockquote></div>}<div className="desk-inspector-document"><span>FULL SOURCE TEXT</span><pre>{inspected.text}</pre></div></> : activeProfile && <><div className="desk-eyebrow">FICTIONAL DEMO RECIPIENT</div><div className="desk-inspector-avatar">{initials(activeProfile.name)}</div><h2>{activeProfile.name}</h2><p className="desk-inspector-role">{activeProfile.role} · {activeProfile.publication}</p><p>{activeProfile.bio}</p><div className="desk-tags">{activeProfile.specialties.map(t => <span key={t}>{t}</span>)}<span>{activeProfile.region}</span></div><div className="desk-inspector-prep"><GitBranch size={16} /><div><strong>{providerName(activeProfile.preparationProvider)}</strong><small>Preparation run {activeProfile.preparationRunId}</small></div></div><h3>Why this profile exists</h3><p className="desk-panel-intro">Each extracted specialty should lead back to a supplied reporting source.</p>{activeProfile.supportingCitations.map((citation, i) => <div className="desk-profile-citation" key={i}><blockquote>{citation.quote}</blockquote><SourceButton citation={citation} onClick={() => inspectCitation(citation)} /></div>)}<h3>Portfolio documents</h3>{activeProfile.sources.map(source => <button className="desk-profile-document" key={source.id} onClick={() => inspectSource(source)}><FileText size={16} /><span>{source.title}</span><ArrowUpRight size={13} /></button>)}<div className="desk-data-boundary"><CircleHelp size={16} /><p>Reporting experience supports relevance. It does not establish identity, trustworthiness, or the truth of a tip.</p></div></>}</aside></div>}
  </div>;
}
