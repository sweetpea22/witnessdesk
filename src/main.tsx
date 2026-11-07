import React from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';
const Phone=React.lazy(()=>import('./contributor/ContributorApp'));
const Desk=React.lazy(()=>import('./desk/DeskApp'));
function App(){const path=window.location.pathname;return <React.Suspense fallback={<div className="app-loading"><span className="brand-mark">W</span><h1>Witness Desk</h1><p>Opening your private workspace…</p></div>}>{path.startsWith('/contribute')?<Phone/>:path==='/preview'?<div className="preview-layout"><header><strong>Witness Desk</strong><span>Live phone + laptop preview · fictional evidence</span><a href="/desk">Open desk ↗</a></header><div className="preview-panels"><section className="preview-phone"><div className="preview-label">CINDY’S PHONE</div><iframe title="Cindy's phone" src="/contribute?demo=1"/></section><section className="preview-desk"><div className="preview-label">INVESTIGATIVE DESK</div><iframe title="Investigative desk" src="/desk"/></section></div></div>:<Desk/>}</React.Suspense>}
createRoot(document.getElementById('root')!).render(<App/>);
