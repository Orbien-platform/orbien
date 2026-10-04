const APP_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "brand": "#1E3A7B",
  "plan": "premium",
  "role": "lider",
  "term": "Célula",
  "screenState": "normal",
  "origin": true
}/*EDITMODE-END*/;

const SCREENS = {
  home: HomeApp, feed: FeedScreen, post: PostScreen, biblia: BibliaScreen, celula: CelulaScreen, mais: MaisScreen,
  notificacoes: NotifScreen, presenca: PresencaScreen, qr: QRScreen, qrauto: p => <QRScreen {...p} auto />, scan: ScanScreen,
  escalas: EscalasScreen, troca: TrocaScreen, indisp: IndispScreen, celebracao: CelebracaoScreen, doar: DoarScreen,
  perfil: PerfilScreen, lgpd: LgpdScreen, visitante: VisitanteScreen,
};
const INDEX = [
  ['Acesso', [['login', 'Login e tema da igreja']]],
  ['Abas', [['home', 'Início'], ['feed', 'Conteúdo'], ['post', 'Detalhe da publicação'], ['biblia', 'Bíblia'], ['celula', 'Célula'], ['mais', 'Mais']]],
  ['Célula', [['presenca', 'Presença (líder)', 'lider'], ['qr', 'QR de check-in (líder)', 'lider'], ['scan', 'Ler QR (membro)', 'membro']]],
  ['Serviço', [['escalas', 'Minhas escalas', 'voluntario'], ['troca', 'Pedir troca', 'voluntario'], ['indisp', 'Indisponibilidade', 'voluntario'], ['celebracao', 'Celebração · OC e setlist', 'lidmin']]],
  ['Pessoal', [['doar', 'Contribuir (PIX)'], ['notificacoes', 'Notificações'], ['perfil', 'Meu perfil'], ['lgpd', 'Privacidade (LGPD)']]],
  ['Liderança', [['visitante', 'Cadastro de visitante', 'lider'], ['qrauto', 'QR de autocadastro', 'pastor']]],
];
const TABS = ['home', 'feed', 'biblia', 'celula', 'mais'];

function MobileApp() {
  const [t, setTweak] = useTweaks(APP_DEFAULTS);
  const [st, setSt] = React.useState(() => { try { return JSON.parse(localStorage.getItem('orb-app-nav')) || { auth: false, tab: 'home', stack: [] }; } catch (e) { return { auth: false, tab: 'home', stack: [] }; } });
  const save = s => { setSt(s); localStorage.setItem('orb-app-nav', JSON.stringify(s)); };
  const nav = {
    push: s => save({ ...st, stack: [...st.stack, s] }),
    back: () => save({ ...st, stack: st.stack.slice(0, -1) }),
    tab: (k, then) => save({ ...st, tab: k, stack: then ? [then] : [] }),
    login: () => save({ auth: true, tab: 'home', stack: [] }),
    logout: () => save({ auth: false, tab: 'home', stack: [] }),
  };
  const jump = id => { if (id === 'login') return nav.logout(); if (TABS.includes(id)) save({ auth: true, tab: id, stack: [] }); else save({ auth: true, tab: st.tab, stack: [id] }); };
  const cur = st.stack.length ? st.stack[st.stack.length - 1] : st.tab;
  const Screen = SCREENS[cur] || HomeApp;
  const T = TERMS[t.term];
  const needVol = ['escalas', 'troca', 'indisp', 'celebracao'].includes(cur) && t.role === 'membro';
  const needLead = ['presenca', 'qr', 'visitante', 'qrauto'].includes(cur) && !isLeader(t.role);
  const ctx = { ...t, T, screenState: (needVol || needLead) ? 'sem acesso' : t.screenState };
  const dark = t.theme === 'dark';
  const brand = st.auth ? t.brand : '#1E3A7B';
  const hideTabs = !st.auth || ['scan', 'presenca'].includes(cur) || (cur === 'celebracao' && false);
  return (
    <OrbCtx.Provider value={ctx}>
      <div className={t.origin ? '' : 'no-otags'} style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: 48, padding: '32px 24px', flexWrap: 'wrap' }}>
        <div style={{ width: 250, paddingTop: 12 }}>
          <div className="row" style={{ gap: 8, marginBottom: 6 }}><OrbLogo s={20} /><span style={{ fontSize: 17 }}><span style={{ fontWeight: 300 }}>orbi</span><span style={{ fontWeight: 600 }}>en</span></span><span className="badge" style={{ marginLeft: 4 }}>App · proposta</span></div>
          <p className="cap" style={{ marginBottom: 18 }}>Vendo como <b style={{ color: 'var(--fg)', fontWeight: 500 }}>{APP_ROLES[t.role].label}</b>. Troque papel, plano e estado no painel de Tweaks.</p>
          <div className="col" style={{ gap: 14 }}>
            {INDEX.map(([sec, items]) => <div key={sec}><div className="label" style={{ marginBottom: 4 }}>{sec}</div>{items.map(([id, l, r]) => { const on = (id === 'login' && !st.auth) || (st.auth && cur === id); return <button key={id} onClick={() => { if (r && !(r === 'voluntario' ? isVol(t.role) : r === 'membro' ? true : r === 'lidmin' ? isVol(t.role) : isLeader(t.role))) setTweak('role', r === 'membro' ? 'membro' : r); jump(id); }} className="row" style={{ width: '100%', height: 28, gap: 8, padding: '0 8px', borderRadius: 6, fontSize: 13, textAlign: 'left', background: on ? 'var(--subtle)' : 'transparent', fontWeight: on ? 500 : 400, color: on ? 'var(--fg)' : 'var(--stone)' }}>{id === 'celula' ? T.s : l}</button>; })}</div>)}
          </div>
          <div className="col" style={{ gap: 6, marginTop: 22, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div className="label">Legenda</div>
            {[['existe', 'Já está no produto'], ['api', 'API pronta, falta tela'], ['promessa', 'Prometido, sem código'], ['proposta', 'Proposta de design']].map(([o, l]) => <div key={o} className="row cap" style={{ gap: 8 }}><O o={o} />{l}</div>)}
          </div>
        </div>
        <IOSDevice dark={dark} width={390} height={844}>
          <div data-theme={t.theme} style={{ '--brand': brand, position: 'absolute', inset: 0, background: 'var(--bg)', color: 'var(--fg)', fontFamily: "'Geist', system-ui, sans-serif", fontSize: 14, display: 'flex', flexDirection: 'column' }}>
            <div key={cur + t.role + st.auth} className="scroll" style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
              {st.auth ? <Screen nav={nav} /> : <LoginScreen nav={nav} />}
            </div>
            {!hideTabs && <TabBar tab={st.tab} nav={nav} />}
          </div>
        </IOSDevice>
      </div>
      <TweaksPanel>
        <TweakSection label="Demonstração" />
        <TweakSelect label="Papel" value={t.role} options={Object.entries(APP_ROLES).map(([v, r]) => ({ value: v, label: r.label }))} onChange={v => setTweak('role', v)} />
        <TweakRadio label="Plano" value={t.plan} options={[{ value: 'starter', label: 'Starter' }, { value: 'premium', label: 'Premium' }]} onChange={v => setTweak('plan', v)} />
        <TweakSelect label="Estado da tela" value={t.screenState} options={['normal', 'carregando', 'vazio', 'erro', 'sem acesso', 'sem conexão']} onChange={v => setTweak('screenState', v)} />
        <TweakToggle label="Etiquetas de origem" value={t.origin} onChange={v => setTweak('origin', v)} />
        <TweakSection label="Igreja" />
        <TweakColor label="Cor da igreja" value={t.brand} options={['#1E3A7B', '#8A2035', '#1F6B4A', '#5B3FA0']} onChange={v => setTweak('brand', v)} />
        <TweakRadio label="Termo do grupo" value={t.term} options={['Célula', 'PG', 'GC']} onChange={v => setTweak('term', v)} />
        <TweakRadio label="Tema" value={t.theme} options={[{ value: 'light', label: 'Claro' }, { value: 'dark', label: 'Escuro' }]} onChange={v => setTweak('theme', v)} />
      </TweaksPanel>
    </OrbCtx.Provider>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<MobileApp />);
