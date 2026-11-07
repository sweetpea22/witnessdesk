import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, BookOpen, Camera, Check, ChevronRight, CircleHelp, Download, FileText, Fingerprint, GitBranch, Inbox, LoaderCircle, LockKeyhole, Network, RefreshCw, RotateCcw, Search, ShieldCheck, Smartphone, Sparkles, X } from 'lucide-react';
import { contributorUrl, ensureDeskSession, getProviderStatus, matchPublicReporters, preparePublicReporters, prepareRecipients, readDesk, reconnectDeskSession, resetDesk, retryAnalysis } from '../shared/api';
import { DEMO_INVOICE, INVOICE_TEXT } from '../shared/contracts';
import type { Analysis, Citation, DeskSession, DeskSnapshot, GraphNode, RecipientGraph, RecipientProfile, RecipientSource, Submission } from '../shared/contracts';
import './desk.css';
import PhotoInspector from './PhotoInspector';
import TinfoilReview from './TinfoilReview';
import StoryPacketPanel from './StoryPacketPanel';
import { downloadCaseBrief } from './brief';

const money = (n: number | null | undefined) => n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const shortTime = (s: string) => new Date(s).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const initials = (s: string) => s.split(' ').map(v => v[0]).slice(0, 2).join('').toUpperCase();
const providerName = (s?: string) => s === 'ollama' ? 'Ollama · on this computer' : s === 'darkbloom' ? 'Darkbloom' : s === 'tinfoil' ? 'Tinfoil' : s === 'fixture' || s === 'deterministic-demo' ? 'Demo fixture' : s || 'Not prepared';

function resultLabels(analysis?: Analysis) {
  if (!analysis) return { inbox: 'Payment record to review', heading: 'Review the payment record', difference: 'Difference', note: 'Awaiting analysis' };
  if (analysis.kind === 'insufficient_evidence' || analysis.difference == null) return { inbox: 'Payment needs more evidence', heading: 'More evidence needed', difference: 'Difference', note: 'No conclusion yet' };
  if (analysis.kind === 'possible_overpayment' && analysis.difference > 0) return { inbox: 'Payment exceeds invoice', heading: 'Payment gap', difference: 'Difference', note: 'Needs explanation' };
  if (analysis.difference === 0) return { inbox: 'Payment matches invoice', heading: 'No payment gap shown', difference: 'Difference', note: 'Amounts match' };
  if (analysis.difference < 0) return { inbox: 'Payment is below invoice', heading: 'Payment below invoiced amount', difference: 'Difference', note: 'No overpayment shown' };
  return { inbox: 'Payment record to review', heading: 'Review the payment record', difference: 'Difference', note: 'No conclusion yet' };
}

type Inspected = { title: string; label: string; text: string; quote?: string; sourceId?: string; url?: string; retrievedAt?: string; sourceType?: string; relation?: string };
const isPublicProfile = (profile: RecipientProfile) => profile.sources.some(source => source.kind === 'public-web');
function publicURL(value?: string) {
  if (!value) return undefined;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? value : undefined; } catch { return undefined; }
}
function filterGraph(graph: RecipientGraph, selectedProfiles: RecipientProfile[], allProfiles: RecipientProfile[]): RecipientGraph {
  const recipients = new Set(selectedProfiles.map(profile => profile.id));
  const allRecipients = new Set(allProfiles.map(profile => profile.id));
  const sources = new Set(selectedProfiles.flatMap(profile => profile.sources.map(source => source.id)));
  const edges = graph.edges.filter(edge => !!edge.sourceDocumentId && sources.has(edge.sourceDocumentId) && (!allRecipients.has(edge.source) || recipients.has(edge.source)) && (!allRecipients.has(edge.target) || recipients.has(edge.target)));
  const included = new Set([...recipients, ...sources, ...edges.flatMap(edge => [edge.source, edge.target])]);
  return { nodes: graph.nodes.filter(node => included.has(node.id)), edges };
}

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
  if (!graph.nodes.length) return <div className="desk-graph-empty"><GitBranch size={32} /><p>No recipient graph yet.</p></div>;
  return <svg className="desk-graph" viewBox={`0 0 900 ${height}`} role="img" aria-label="Recipient graph with clickable source documents, extracted topics, and reporters">
    <text x="150" y="25" className="desk-graph-column">Sources</text><text x="450" y="25" className="desk-graph-column">Topics</text><text x="750" y="25" className="desk-graph-column">Recipients</text>
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
  const [expiredSession, setExpiredSession] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);
  const [inspected, setInspected] = useState<Inspected | null>(null);
  const [activeProfile, setActiveProfile] = useState<RecipientProfile | null>(null);
  const [photoSubmission, setPhotoSubmission] = useState<Submission | null>(null);
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState('');
  const [dataset, setDataset] = useState<'public' | 'demo'>('public');
  const [networkCohort, setNetworkCohort] = useState('all');
  const [matchCohort, setMatchCohort] = useState('all');
  const [publicError, setPublicError] = useState('');
  const [matchError, setMatchError] = useState<{ id: string; message: string } | null>(null);
  const pollingVersion = useRef(0);
  const activeSession = useRef<DeskSession | null>(null);
  const pollingPaused = useRef(false);
  const acceptSession = useCallback((next: DeskSession) => {
    pollingVersion.current += 1;
    activeSession.current = next;
    pollingPaused.current = false;
    setSession(next);
  }, []);
  const pausePolling = () => { pollingVersion.current += 1; pollingPaused.current = true; };

  const connectDesk = useCallback(async () => { try { const [s] = await Promise.all([ensureDeskSession(), getProviderStatus().catch(() => undefined)]); acceptSession(s); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Could not open the desk.'); } }, [acceptSession]);
  useEffect(() => { void connectDesk(); }, [connectDesk]);
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPairOpen(false); setInspected(null); setActiveProfile(null); setPhotoSubmission(null); } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, []);
  const refresh = useCallback(async () => {
    if (!session || expiredSession || pollingPaused.current || activeSession.current !== session) return;
    const version = pollingVersion.current;
    const isCurrent = () => version === pollingVersion.current && activeSession.current === session && !pollingPaused.current;
    try { const data = await readDesk(session); if (!isCurrent()) return; setSnapshot(data); setError(''); }
    catch (e) {
      if (!isCurrent()) return;
      const code = (e as { code?: number })?.code;
      if (code === 403 || code === 410) {
        pollingVersion.current += 1; pollingPaused.current = true;
        setExpiredSession(true);
        setPairOpen(false);
        setError('This desk session expired. Reconnect to create a new phone link; your phone will need to scan again.');
      } else setError(e instanceof Error ? e.message : 'Connection interrupted.');
    }
  }, [session, expiredSession]);
  useEffect(() => { if (!session || expiredSession) return; void refresh(); const timer = window.setInterval(() => void refresh(), 2000); return () => clearInterval(timer); }, [session, refresh, expiredSession]);
  const reconnect = async () => {
    if (!session) return;
    setBusy('reconnect');
    pausePolling();
    try {
      const next = await reconnectDeskSession(session);
      acceptSession(next); setSnapshot(null); setSelectedId(null); setInspected(null); setActiveProfile(null); setPhotoSubmission(null);
      setExpiredSession(false); setError(''); setTab('evidence'); setPairOpen(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not reconnect the desk. Try again.'); }
    finally { setBusy(''); }
  };
  const submissions = snapshot?.submissions || [];
  const selected = submissions.find(s => s.id === selectedId) || submissions[0];
  const selectedLabels = resultLabels(selected?.analysis);
  const profiles = snapshot?.recipients || [];
  const status = snapshot?.status;
  const prep = status?.preparation;
  const reporterNetwork = snapshot?.reporterNetwork;
  const cohorts = reporterNetwork?.cohorts || [];
  const publicProfiles = reporterNetwork?.profiles || [];
  const datasetProfiles = dataset === 'public' ? publicProfiles : profiles;
  const networkPrep = dataset === 'public' ? reporterNetwork?.preparation : prep;
  const filteredProfiles = datasetProfiles.filter(profile => (dataset !== 'public' || networkCohort === 'all' || profile.cohortIds?.includes(networkCohort)) && `${profile.name} ${profile.publication} ${profile.specialties.join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  const networkSources = [...new Map(filteredProfiles.flatMap(profile => profile.sources).map(source => [source.id, source])).values()];
  const networkGraph = filterGraph((dataset === 'public' ? reporterNetwork?.graph : snapshot?.graph) || { nodes: [], edges: [] }, filteredProfiles, datasetProfiles);
  const sources = useMemo(() => [...new Map([...profiles, ...publicProfiles, ...(selected?.reporterMatch?.profiles || []), ...(activeProfile ? [activeProfile] : [])].flatMap(profile => profile.sources).map(source => [source.id, source])).values()], [profiles, publicProfiles, selected?.reporterMatch?.profiles, activeProfile]);
  const matchCohortIds = matchCohort === 'all' ? cohorts.map(cohort => cohort.id) : [matchCohort];
  const matchRun = selected?.reporterMatch;
  const matchedProfiles = matchRun?.profiles || [];
  const hasPublicMatches = matchRun?.state === 'ready' && !!matchRun.matches?.length;
  const matchProvider = status?.mode === 'tinfoil-container' ? 'tinfoil' : 'ollama';
  const matchInProgress = matchRun?.state === 'matching' || busy === `match:${selected?.id}`;
  const matchingAvailable = matchProvider === 'tinfoil' ? !!status?.tinfoilConfigured : !!status?.ollamaAvailable;
  const matchingReady = !!session && !expiredSession && selected?.state === 'ready' && !!selected.analysis && reporterNetwork?.preparation.state === 'ready' && matchCohortIds.length > 0 && publicProfiles.some(profile => profile.cohortIds?.some(id => matchCohortIds.includes(id))) && matchingAvailable;
  const pairedUrl = session ? contributorUrl(session) : '';
  const connected = !!snapshot && !error;

  const inspectSource = (source: RecipientSource, quote?: string) => { setInspected({ title: source.title, label: source.kind === 'public-web' ? 'Public reporting source' : 'Fictional source document', text: source.text, quote, sourceId: source.id, url: source.url, retrievedAt: source.retrievedAt, sourceType: source.sourceType, relation: source.relation }); };
  const inspectCitation = (citation: Citation, submission?: Submission) => {
    const source = activeProfile?.sources.find(s => s.id === citation.documentId) || sources.find(s => s.id === citation.documentId);
    if (source) { inspectSource(source, citation.quote); return; }
    const isInvoice = citation.documentId === 'invoice-inv204';
    setInspected({ title: citation.title, label: 'Evidence excerpt · fictional record', text: isInvoice ? INVOICE_TEXT : submission?.tip.evidenceText || citation.quote, quote: citation.quote, sourceId: citation.documentId });
  };
  const buildProfiles = async (provider: 'ollama' | 'darkbloom') => { if (!session) return; setBusy(provider); setError(''); try { await prepareRecipients(session, provider); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Preparation failed.'); } finally { setBusy(''); } };
  const preparePublic = async (provider: 'ollama' | 'darkbloom', refreshSources = false) => {
    if (!session || expiredSession) return;
    setBusy('public-prepare'); setPublicError('');
    try { await preparePublicReporters(session, provider, refreshSources); await refresh(); }
    catch (reason) { setPublicError(reason instanceof Error ? reason.message : 'Reporter preparation failed.'); }
    finally { setBusy(''); }
  };
  const findPublicMatches = async () => {
    if (!session || !selected || !matchingReady || matchInProgress) return;
    const id = selected.id;
    setBusy(`match:${id}`); setMatchError(null);
    try { await matchPublicReporters(session, id, matchCohortIds, matchProvider); await refresh(); }
    catch (reason) { setMatchError({ id, message: reason instanceof Error ? reason.message : 'Reporter matching failed.' }); }
    finally { setBusy(''); }
  };
  const retry = async () => { if (!session || !selected) return; setBusy('retry'); try { await retryAnalysis(session, selected.id); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Retry failed.'); } finally { setBusy(''); } };
  const reset = async () => { if (!session || !window.confirm('Clear this demo desk and rotate the phone submission link?')) return; setBusy('reset'); pausePolling(); try { const next = await resetDesk(session); acceptSession(next); setSelectedId(null); setSnapshot(null); setInspected(null); setActiveProfile(null); setPhotoSubmission(null); } catch (e) { pollingPaused.current = false; setError(e instanceof Error ? e.message : 'Reset failed.'); } finally { setBusy(''); } };
  const copyLink = async () => { try { await navigator.clipboard.writeText(pairedUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setError('Copy is unavailable here. Open the contributor link or scan the code.'); } };
  const nodeSelected = (node: GraphNode) => {
    const profile = datasetProfiles.find(p => p.id === node.id || `recipient:${p.id}` === node.id);
    if (profile) { setActiveProfile(profile); return; }
    const source = networkSources.find(s => s.id === node.id || `article:${s.id}` === node.id || `source:${s.id}` === node.id);
    if (source) { inspectSource(source); return; }
    const edges = networkGraph.edges.filter(e => e.source === node.id || e.target === node.id);
    const linkedSources = [...new Set(edges.map(e => e.sourceDocumentId).filter(Boolean))].map(id => networkSources.find(s => s.id === id)).filter(Boolean) as RecipientSource[];
    setInspected({ title: node.label, label: `${node.type === 'region' ? 'Regional context' : 'Extracted topic'} · source-backed connection`, text: linkedSources.length ? linkedSources.map(s => `${s.title}\n\n${s.text}`).join('\n\n———\n\n') : `This ${node.type} connects ${edges.length} records in the recipient graph. Open a connected recipient to inspect its supporting source documents.` });
  };

  return <div className="desk-app">
    <aside className="desk-rail">
      <a className="desk-brand" href="/desk" aria-label="Witness Desk"><Fingerprint size={26} /><span>WITNESS<br /><b>DESK</b></span></a>
      <div className="desk-rail-divider" />
      <button className={tab === 'evidence' ? 'is-active' : ''} onClick={() => setTab('evidence')}><Inbox size={19} /><span>Evidence</span>{submissions.length > 0 && <span className="desk-nav-count">{submissions.length}</span>}</button>
      <button className={tab === 'network' ? 'is-active' : ''} onClick={() => setTab('network')}><Network size={19} /><span>Recipients</span></button>
    </aside>
    <div className="desk-shell">
      <header className="desk-topbar"><h1>{tab === 'evidence' ? 'Evidence' : 'Recipients'}</h1><div className="desk-topbar-right"><span className={`desk-connection ${connected ? 'is-connected' : ''}`}><i />{expiredSession ? 'Desk expired' : connected ? 'Desk connected' : 'Connecting'}</span><button className="desk-primary" onClick={() => setPairOpen(true)} disabled={!session || expiredSession}><Smartphone size={16} />Connect a phone</button><button className="desk-icon-button" onClick={reset} disabled={!session || expiredSession || busy === 'reset'} title="Reset demo" aria-label="Reset demo"><RotateCcw size={16} /></button></div></header>
      <main className="desk-main">
        {error && <div className="desk-error" role="alert"><CircleHelp size={16} /><span>{error}</span><button onClick={() => void (expiredSession ? reconnect() : session ? refresh() : connectDesk())} disabled={busy === 'reconnect'}>{expiredSession ? 'Reconnect desk' : 'Retry'}</button></div>}
        {tab === 'evidence' ? <div className="desk-evidence-layout">
          <section className="desk-inbox"><div className="desk-section-label"><span>Submissions</span><span className="desk-count">{submissions.length}</span></div>
            {submissions.map(sub => <button key={sub.id} className={`desk-inbox-card ${selected?.id === sub.id ? 'is-selected' : ''}`} onClick={() => setSelectedId(sub.id)}><div className="desk-inbox-card-top"><span className="desk-small-avatar">{initials(sub.tip.contributorAlias || 'Source')}</span><span>{sub.tip.contributorAlias || 'Contributor'}</span></div><strong>{resultLabels(sub.analysis).inbox}</strong><div className="desk-inbox-card-bottom"><span className={`desk-state state-${sub.state}`}>{sub.state === 'ready' ? 'Ready to review' : sub.state === 'analyzing' ? 'Analyzing' : sub.state === 'failed' ? 'Needs attention' : 'Received'}</span><ArrowRight size={14} /></div></button>)}
            <div className="desk-reference"><BookOpen size={17} /><button onClick={() => setInspected({ title: `Invoice ${DEMO_INVOICE.invoiceId}`, label: 'Seeded reference · fictional record', text: INVOICE_TEXT })}>Invoice {DEMO_INVOICE.invoiceId} <ArrowUpRight size={13} /></button><a href="/demo-invoice.pdf" target="_blank" rel="noreferrer" aria-label={`Invoice ${DEMO_INVOICE.invoiceId} PDF`}>PDF</a></div>
          </section>
          <section className="desk-case-panel">
            {selected ? <>
              <div className="desk-case-heading"><h2>{selectedLabels.heading}</h2></div>
              {selected.analysis ? <>
                <div className="desk-amount-grid"><div><span>Invoiced</span><strong>{money(selected.analysis.invoiceAmount)}</strong></div><div><span>Sent</span><strong>{money(selected.analysis.paymentAmount)}</strong></div><div className="desk-amount-gap"><span>Difference</span><strong>{money(selected.analysis.difference)}</strong></div></div>
                <div className="desk-finding"><p>{selected.analysis.summary}</p><details className="desk-details"><summary>Analysis details</summary><p>{providerName(selected.analysis.provider)} · {selected.analysis.model} · {(selected.analysis.durationMs / 1000).toFixed(1)}s</p><p>Fictional demonstration. Model suggestions require review.</p></details></div>
                <div className="desk-evidence-title"><h3>Source excerpts</h3></div>
                <div className="desk-citations">{selected.analysis.citations.map((citation, i) => <div className="desk-citation" key={`${citation.documentId}-${i}`}><div><blockquote>{citation.quote}</blockquote><SourceButton citation={citation} onClick={() => inspectCitation(citation, selected)} /></div></div>)}</div>
                <div className="desk-open-question"><div><h3>Questions</h3>{selected.analysis.openQuestions.map((q, i) => <p key={i}>{q}</p>)}</div></div>
                {session && <TinfoilReview key={selected.id} session={session} submission={selected} configured={!!status?.tinfoilConfigured && !expiredSession} profiles={profiles} onUpdated={refresh} onCitation={citation => inspectCitation(citation, selected)} onProfile={setActiveProfile} />}
              </> : <div className="desk-analysis-wait">{selected.state === 'failed' ? <CircleHelp size={30} /> : <LoaderCircle className="desk-spin" size={30} />}<h3>{selected.state === 'failed' ? 'Analysis failed' : 'Analyzing evidence…'}</h3>{selected.error && <p>{selected.error}</p>}{selected.state === 'failed' && <button className="desk-secondary" onClick={retry} disabled={busy === 'retry'}><RefreshCw size={14} />Retry analysis</button>}</div>}
              {selected.photo && <div className="desk-photo-card"><Camera size={22} /><strong>Submitted photo</strong><button className="desk-secondary" onClick={() => { setInspected(null); setActiveProfile(null); setPhotoSubmission(selected); }}>View submitted photo<ArrowUpRight size={13} /></button></div>}
              <details className="desk-original"><summary><FileText size={15} />Original submission<ChevronRight size={14} /></summary><p>Submitted by {selected.tip.contributorAlias || 'Contributor'} · {shortTime(selected.receivedAt)}</p><pre>{selected.tip.evidenceText}</pre>{selected.tip.contextNote && <div className="desk-context-note"><strong>Contributor context</strong><p>{selected.tip.contextNote}</p></div>}<p>Fictional demonstration. Contributor identity is unverified.</p></details>
              {selected.analysis && <div className="desk-case-actions"><button className="desk-secondary" onClick={() => downloadCaseBrief(selected, profiles)}><Download size={14} />Download case brief</button></div>}
              {selected.analysis && selected.state === 'ready' && <StoryPacketPanel key={selected.id} submission={selected} />}
            </> : <div className="desk-case-empty"><h2>No evidence yet.</h2></div>}
          </section>
          <aside className="desk-recipient-panel">
            {selected && <section className="desk-public-matches" aria-label="Public reporter matches">
              <h3>Public reporter matches</h3>
              <label className="desk-select-field">Cohort<select aria-label="Match cohort" value={matchCohort} onChange={event => setMatchCohort(event.target.value)} disabled={matchInProgress}><option value="all">All cohorts</option>{cohorts.map(cohort => <option key={cohort.id} value={cohort.id}>{cohort.label}</option>)}</select></label>
              {matchProvider === 'tinfoil' && !matchInProgress && <p className="desk-match-disclosure">Tinfoil receives reviewed case text and the selected reporter profiles.</p>}
              <button className="desk-secondary desk-match-button" onClick={() => void findPublicMatches()} disabled={!matchingReady || matchInProgress || !!busy}>{matchInProgress ? <LoaderCircle className="desk-spin" size={15} /> : <Search size={15} />}{matchProvider === 'tinfoil' ? 'Find matches with Tinfoil' : 'Find matches locally'}</button>
              {matchInProgress && <p role="status">Matching reporters…</p>}
              {reporterNetwork?.preparation.state !== 'ready' && <button className="desk-text-button" onClick={() => { setDataset('public'); setTab('network'); }}>Prepare reporter profiles<ArrowRight size={13} /></button>}
              {!matchingAvailable && <p role="status">{matchProvider === 'tinfoil' ? 'Tinfoil unavailable.' : 'Local model unavailable.'}</p>}
              {(matchError?.id === selected.id || matchRun?.state === 'failed') && <p className="desk-match-error" role="alert">{matchError?.id === selected.id ? matchError.message : matchRun?.error || 'Matching failed.'}</p>}
              {matchRun?.state === 'ready' && <ol className="desk-ranked-matches">{(matchRun.matches || []).map((match, index) => { const profile = matchedProfiles.find(item => item.id === match.recipientId); if (!profile) return null; return <li key={match.recipientId}><div className="desk-match-person"><span>{index + 1}</span><button onClick={() => setActiveProfile(profile)}><strong>{profile.name}</strong><span>{profile.publication}</span></button><ArrowUpRight size={14} /></div><p>{match.reason}</p><div className="desk-match-sources">{match.sourceIds.map(id => { const source = profile.sources.find(item => item.id === id); return source && <button className="desk-source-button" key={id} onClick={() => { setActiveProfile(profile); inspectSource(source); }}><FileText size={13} /><span>{source.title}</span><ArrowUpRight size={12} /></button>; })}</div></li>; })}</ol>}
              {matchRun?.state === 'ready' && !matchRun.matches?.length && <p>No supported matches.</p>}
              {matchRun && <details className="desk-details"><summary>Matching details</summary><p>{providerName(matchRun.provider)}{matchRun.model ? ` · ${matchRun.model}` : ''}{matchRun.durationMs != null ? ` · ${(matchRun.durationMs / 1000).toFixed(1)}s` : ''}</p><p>{matchRun.cohortIds.map(id => cohorts.find(cohort => cohort.id === id)?.label || id).join(', ')}</p>{matchRun.preparationRunId && <p>Preparation run {matchRun.preparationRunId}</p>}{matchRun.verification?.securityVerified && <><p>Inference verified · {matchRun.verification.verifiedAt}</p><p>{matchRun.verification.enclaveHost}</p><p>{matchRun.verification.configRepo}</p><p>{matchRun.verification.releaseDigest}</p></>}<p>Matches describe reporting relevance. No reporter has been contacted.</p></details>}
            </section>}
            {!hasPublicMatches && <details className="desk-demo-recipients"><summary>Demo recipients</summary>{profiles.length ? <div className="desk-profile-list">{[...profiles].sort((a, b) => (selected?.analysis?.recipientIds.includes(b.id) ? 1 : 0) - (selected?.analysis?.recipientIds.includes(a.id) ? 1 : 0)).map(p => <ProfileCard key={p.id} profile={p} recommended={selected?.analysis?.recipientIds.includes(p.id)} onSelect={() => setActiveProfile(p)} />)}</div> : <div className="desk-mini-empty"><p>No recipients yet.</p></div>}<details className="desk-details"><summary>Preparation details</summary><p>{providerName(prep?.provider)}</p><p>Fictional recipients. No tip is sent onward.</p></details></details>}
            <button className="desk-network-link" onClick={() => setTab('network')}>View network<ArrowUpRight size={14} /></button>
          </aside>
        </div> : <section className="desk-network-workspace">
          <div className="desk-network-toolbar">
            <div className="desk-network-filters"><label className="desk-select-field">Dataset<select aria-label="Reporter dataset" value={dataset} onChange={event => { setDataset(event.target.value as 'public' | 'demo'); setSearch(''); }}><option value="public">Public reporters</option><option value="demo">Demo reporters</option></select></label>{dataset === 'public' && <label className="desk-select-field">Cohort<select aria-label="Network cohort" value={networkCohort} onChange={event => setNetworkCohort(event.target.value)}><option value="all">All cohorts</option>{cohorts.map(cohort => <option key={cohort.id} value={cohort.id}>{cohort.label}</option>)}</select></label>}</div>
            <div className="desk-network-actions">{dataset === 'public' ? <><button className="desk-secondary" onClick={() => void preparePublic('darkbloom')} disabled={!!busy || networkPrep?.state === 'working' || !session || expiredSession || !status?.darkbloomConfigured}>Prepare with Darkbloom</button><button className="desk-secondary" onClick={() => void preparePublic('ollama')} disabled={!!busy || networkPrep?.state === 'working' || !session || expiredSession || status?.mode !== 'local-demo' || !status?.ollamaAvailable}>Prepare locally</button><button className="desk-text-button" onClick={() => void preparePublic(status?.darkbloomConfigured ? 'darkbloom' : 'ollama', true)} disabled={!!busy || networkPrep?.state === 'working' || !session || expiredSession || (!status?.darkbloomConfigured && !status?.ollamaAvailable)}><RefreshCw size={14} />Refresh public sources</button></> : <><button className="desk-secondary" onClick={() => void buildProfiles('ollama')} disabled={!!busy || networkPrep?.state === 'working' || !session || expiredSession}>{busy === 'ollama' || networkPrep?.state === 'working' ? <LoaderCircle className="desk-spin" size={15} /> : <Sparkles size={15} />}Build with local model</button>{status?.darkbloomConfigured && <button className="desk-secondary" onClick={() => void buildProfiles('darkbloom')} disabled={!!busy || networkPrep?.state === 'working' || expiredSession}>Use Darkbloom<ArrowUpRight size={14} /></button>}</>}</div>
          </div>
          <div className="desk-preparation-strip"><span className={`desk-state state-${networkPrep?.state === 'ready' ? 'ready' : networkPrep?.state === 'failed' ? 'failed' : 'received'}`} role="status">{networkPrep?.state?.replace('_', ' ') || 'not started'}</span><span>{networkSources.length} sources · {filteredProfiles.length} recipients</span><details className="desk-details"><summary>Preparation details</summary><p>{providerName(networkPrep?.provider)} · {networkPrep?.model || 'No model selected'}</p>{networkPrep?.runId && <p>Run {networkPrep.runId}</p>}<p>{dataset === 'public' ? 'Public professional metadata only. Private submissions are excluded from preparation.' : 'Fictional portfolio sources. Contributor tips are excluded from graph preparation.'}</p></details></div>{(networkPrep?.error || (dataset === 'public' && publicError)) && <div className="desk-error" role="alert">{dataset === 'public' && publicError || networkPrep?.error}</div>}
          <div className="desk-network-body"><div className="desk-network-canvas"><ProvenanceGraph graph={networkGraph} onNode={nodeSelected} /></div><aside className="desk-network-directory"><label className="desk-search"><Search size={15} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a recipient" /></label>{filteredProfiles.map(p => <ProfileCard key={p.id} profile={p} onSelect={() => setActiveProfile(p)} />)}{!filteredProfiles.length && <p>{datasetProfiles.length ? 'No matching recipients.' : 'No recipients yet.'}</p>}</aside></div>
          <div className="desk-source-library"><h3>Sources</h3><div className="desk-source-library-grid">{networkSources.map(source => <button key={source.id} onClick={() => inspectSource(source)}><FileText size={19} /><span>{source.title}</span><ArrowUpRight size={14} /></button>)}</div></div>
        </section>}
      </main>
    </div>
    {pairOpen && <div className="desk-modal-backdrop" onClick={() => setPairOpen(false)}><section className="desk-pair-modal" role="dialog" aria-modal="true" aria-labelledby="pair-title" onClick={e => e.stopPropagation()}><button className="desk-modal-close" onClick={() => setPairOpen(false)} aria-label="Close pairing"><X size={19} /></button><h2 id="pair-title">Connect a phone</h2><div className="desk-qr">{pairedUrl && <QRCodeSVG value={pairedUrl} size={210} bgColor="#ffffff" fgColor="#292820" level="M" />}</div><a className="desk-primary" href={pairedUrl} target="_blank" rel="noreferrer">Open contributor view<ArrowUpRight size={15} /></a><button className="desk-text-button" onClick={copyLink}>{copied ? <><Check size={14} />Link copied</> : 'Copy phone link'}</button>{pairedUrl.includes('localhost') && <div className="desk-pair-local-note">A phone needs the shared HTTPS address.</div>}</section></div>}
    {photoSubmission?.photo && session && <PhotoInspector session={session} photo={photoSubmission.photo} contributorAlias={photoSubmission.tip.contributorAlias} submittedText={photoSubmission.tip.evidenceText} onClose={() => setPhotoSubmission(null)} />}
    {(inspected || activeProfile) && <div className="desk-inspector-backdrop" onClick={() => { setInspected(null); setActiveProfile(null); }}><aside className="desk-inspector" role="dialog" aria-modal="true" aria-label="Source inspector" onClick={e => e.stopPropagation()}><button className="desk-modal-close" onClick={() => { setInspected(null); setActiveProfile(null); }} aria-label="Close source inspector"><X size={19} /></button>{inspected ? <>{activeProfile && <button className="desk-text-button desk-inspector-back" onClick={() => setInspected(null)}>← Back to {activeProfile.name}</button>}<h2>{inspected.title}</h2><details className="desk-details"><summary>Source details</summary><p>{inspected.label}</p>{inspected.sourceId && <p>{inspected.sourceId}</p>}{publicURL(inspected.url) && <p><a className="desk-public-link" href={publicURL(inspected.url)} target="_blank" rel="noreferrer noopener">{inspected.url}<ArrowUpRight size={13} /></a></p>}{inspected.retrievedAt && <p>Retrieved <time dateTime={inspected.retrievedAt}>{inspected.retrievedAt}</time></p>}{inspected.sourceType && <p>{inspected.sourceType}{inspected.relation ? ` · ${inspected.relation}` : ''}</p>}</details>{inspected.quote && <div className="desk-inspector-quote"><h3>Quoted passage</h3><blockquote>{inspected.quote}</blockquote></div>}<div className="desk-inspector-document"><h3>Source text</h3><pre>{inspected.text}</pre></div></> : activeProfile && <><h2>{activeProfile.name}</h2><p>{activeProfile.role} · {activeProfile.publication}</p><div className="desk-tags">{activeProfile.specialties.map(t => <span key={t}>{t}</span>)}<span>{activeProfile.region}</span></div><details className="desk-details"><summary>Profile details</summary><p>{providerName(activeProfile.preparationProvider)}</p><p>Run {activeProfile.preparationRunId}</p><p>{isPublicProfile(activeProfile) ? 'Public professional information. No reporter has been contacted.' : 'Fictional recipient. Reporting experience supports relevance; identity and trustworthiness are unverified.'}</p></details>{activeProfile.publicContact && publicURL(activeProfile.publicContact.url) && <a className="desk-public-contact" href={publicURL(activeProfile.publicContact.url)} target="_blank" rel="noreferrer noopener">{activeProfile.publicContact.scope === 'newsroom' ? 'Newsroom contact page' : 'Public contact page'}<ArrowUpRight size={14} /></a>}<h3>Sources</h3>{activeProfile.supportingCitations.map((citation, i) => <div className="desk-profile-citation" key={i}><blockquote>{citation.quote}</blockquote><SourceButton citation={citation} onClick={() => inspectCitation(citation)} /></div>)}{activeProfile.sources.map(source => <button className="desk-profile-document" key={source.id} onClick={() => inspectSource(source)}><FileText size={16} /><span>{source.title}</span><ArrowUpRight size={13} /></button>)}</>}</aside></div>}
  </div>;
}
