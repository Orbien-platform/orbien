// Shared: icons, primitives, context, state views
const ICONS = {
  check:'<path d="M20 6L9 17l-5-5"/>',x:'<path d="M18 6L6 18M6 6l12 12"/>',plus:'<path d="M12 5v14M5 12h14"/>',
  'arrow-right':'<path d="M5 12h14M13 5l7 7-7 7"/>','arrow-left':'<path d="M19 12H5M11 19l-7-7 7-7"/>',
  'chev-r':'<path d="M9 18l6-6-6-6"/>','chev-l':'<path d="M15 18l-6-6 6-6"/>','chev-d':'<path d="M6 9l6 6 6-6"/>',
  'trend-up':'<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>','trend-down':'<path d="M23 18l-9.5-9.5-5 5L1 6"/><path d="M17 18h6v-6"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',bell:'<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  home:'<path d="M3 9.5L12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11"/>',
  user:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  'user-plus':'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  wallet:'<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
  heart:'<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/>',
  calendar:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  music:'<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  bookmark:'<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  qr:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 19h2"/>',
  mail:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/>',
  phone:'<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  pin:'<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  alert:'<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  pix:'<path d="M9 3L3 9v6l6 6h6l6-6V9l-6-6z"/><path d="M8 12l4 4 4-4-4-4z"/>',
  download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  filter:'<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
  sparkles:'<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M19 14l.7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7z"/>',
  more:'<circle cx="12" cy="12" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  book:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/><path d="M20 17v5H6.5A2.5 2.5 0 0 1 4 19.5"/>',
  file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  layers:'<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>',
  shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  lock:'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  globe:'<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  send:'<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
  megaphone:'<path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1zM16 8a5 5 0 0 1 0 8"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  grid:'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  refresh:'<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  eye:'<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  swap:'<path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/>',
  msg:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  target:'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  branch:'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="8" r="3"/><path d="M6 9v6M18 11c0 4-6 3-9 6"/>',
  chart:'<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  receipt:'<path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 1 .7V2l-1 .7L16 1l-3 2-3-2-3 2z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  edit:'<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash:'<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  camera:'<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  play:'<path d="M5 3l14 9-14 9V3z"/>',star:'<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
  crown:'<path d="M2 18l2-11 5 5 3-7 3 7 5-5 2 11z"/>',
  copy:'<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/>',
  mic:'<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4"/>',
  video:'<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
  layout:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
  inbox:'<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  bank:'<path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3"/>',
  tag:'<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><path d="M7 7h.01"/>',
  pray:'<path d="M12 3c-2 3-3 6-3 9v5l-4 4M12 3c2 3 3 6 3 9v5l4 4M12 3v18"/>',
  wifi:'<path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.58 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>',
  move:'<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  fingerprint:'<path d="M12 11c0 3.5-1 6-3 8M8 11a4 4 0 0 1 8 0c0 2-.3 4-1 6M4 11a8 8 0 0 1 16 0c0 1.5-.1 3-.4 4.5M12 15c0 2-.5 4-1.5 6"/>',
};
const Ic = ({ n, s = 18, w = 1.6, style, className }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, ...style }} className={className} dangerouslySetInnerHTML={{ __html: ICONS[n] || ICONS.info }} />
);
const OrbLogo = ({ s = 22 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" /><circle cx="19" cy="9" r="2.2" fill="#00B8A2" /></svg>
);

const ORIGIN_LABEL = { existe: 'Existe', api: 'API', promessa: 'Promessa', proposta: 'Proposta' };
const O = ({ o }) => o ? <span className={`otag ${o}`} title={{ existe: 'Já está no produto', api: 'API pronta, falta tela', promessa: 'Prometido, sem código', proposta: 'Proposta de design' }[o]}>{ORIGIN_LABEL[o]}</span> : null;

const Av = ({ name = '?', s = 32, tone }) => {
  const ini = name.split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  return <div className={`av ${tone || ''}`} style={{ width: s, height: s, fontSize: s * .36, borderRadius: s > 40 ? 14 : 9 }}>{ini}</div>;
};
const Tog = ({ on, onChange }) => <button className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange && onChange(!on)} aria-pressed={on} />;
const Seg = ({ value, options, onChange }) => (
  <div className="seg">{options.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return <button key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>; })}</div>
);
const Health = ({ h }) => {
  const m = { green: ['green', 'Saudável'], amber: ['amber', 'Atenção'], red: ['red', 'Crítico'] }[h];
  return <span className="row" style={{ gap: 6 }}><span className={`dot ${m[0]}`} /><span>{m[1]}</span></span>;
};

// ── Context
const OrbCtx = React.createContext({});
const useOrb = () => React.useContext(OrbCtx);
const TERMS = {
  'Célula': { s: 'Célula', p: 'Células', g: 'a', sl: 'célula', pl: 'células' },
  'PG': { s: 'PG', p: 'PGs', g: 'o', sl: 'PG', pl: 'PGs' },
  'GC': { s: 'GC', p: 'GCs', g: 'o', sl: 'GC', pl: 'GCs' },
};

// ── State views (loading / empty / error / no access)
const Skel = ({ rows = 5 }) => (
  <div className="col" style={{ gap: 14 }}>
    <div className="row" style={{ gap: 14 }}>{[0, 1, 2].map(i => <div key={i} className="sk" style={{ height: 84, flex: 1 }} />)}</div>
    {Array.from({ length: rows }).map((_, i) => <div key={i} className="sk" style={{ height: 44, width: `${100 - (i % 3) * 12}%` }} />)}
  </div>
);
const StateBox = ({ icon, title, text, action, tone }) => (
  <div className="col fade" style={{ alignItems: 'center', textAlign: 'center', padding: '56px 24px', gap: 10 }}>
    <div style={{ width: 48, height: 48, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: tone === 'err' ? 'var(--crimson-dim)' : 'var(--subtle)', color: tone === 'err' ? 'var(--crimson-ink)' : 'var(--stone)' }}><Ic n={icon} s={22} /></div>
    <h3 style={{ fontSize: 17, marginTop: 6 }}>{title}</h3>
    <p className="stone" style={{ maxWidth: 380, fontSize: 13.5 }}>{text}</p>
    {action && <div style={{ marginTop: 8 }}>{action}</div>}
  </div>
);
const Stateful = ({ empty, children, compact }) => {
  const { screenState } = useOrb();
  if (screenState === 'carregando') return <div style={{ padding: compact ? 16 : 0 }}><Skel rows={compact ? 4 : 6} /></div>;
  if (screenState === 'vazio') return <StateBox icon={empty?.icon || 'inbox'} title={empty?.title || 'Nada por aqui ainda'} text={empty?.text || 'Quando houver registros, eles aparecem aqui.'} action={empty?.action} />;
  if (screenState === 'erro') return <StateBox tone="err" icon="alert" title="Não foi possível carregar" text="Verifique a conexão e tente de novo. Se continuar, fale com o suporte." action={<button className="btn secondary"><Ic n="refresh" s={15} />Tentar de novo</button>} />;
  if (screenState === 'sem acesso') return <StateBox icon="lock" title="Você não tem acesso a esta área" text="Seu papel não inclui esta permissão. Peça ao administrador da igreja, se precisar." />;
  return children;
};

// Premium gate — discreet invitation in Starter
const PremiumInvite = ({ what, children, inline }) => {
  const { plan } = useOrb();
  if (plan === 'premium') return children || null;
  if (inline) return <span className="badge brand" title="Disponível no Premium"><Ic n="crown" s={11} />Premium</span>;
  return (
    <div className="card" style={{ padding: 18, display: 'flex', gap: 14, alignItems: 'center', borderStyle: 'dashed', boxShadow: 'none', background: 'transparent' }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--brand-dim)', color: 'var(--brand-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic n="crown" s={17} /></div>
      <div className="grow"><div style={{ fontWeight: 500 }}>{what}</div><div className="cap">Disponível no plano Premium.</div></div>
      <button className="btn secondary sm">Conhecer o Premium</button>
    </div>
  );
};
const PBadge = () => { const { plan } = useOrb(); return <span className="badge brand" style={{ height: 19, fontSize: 10, opacity: plan === 'premium' ? .85 : 1 }}><Ic n="crown" s={10} />Premium</span>; };

const fmt = n => n.toLocaleString('pt-BR');
const brl = n => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

Object.assign(window, { Ic, OrbLogo, O, Av, Tog, Seg, Health, OrbCtx, useOrb, TERMS, Skel, StateBox, Stateful, PremiumInvite, PBadge, fmt, brl });
