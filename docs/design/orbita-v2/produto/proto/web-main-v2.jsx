const WEB_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "brand": "#1E3A7B",
  "plan": "premium",
  "role": "pastor",
  "term": "Célula",
  "screenState": "normal",
  "origin": true,
  "support": false
}/*EDITMODE-END*/;

const PAGES = {
  inicio: HomeWeb, pessoas: PessoasList, pessoa: PessoaPage, grupos: GruposList, grupo: GrupoPage, materiais: MateriaisPage,
  celebracoes: CelebracoesList, celebracao: CelebracaoPage, escalas: EscalasPage, publicacoes: PublicacoesPage, 'pub-editor': PubEditor,
  'fin-geral': FinGeral, 'fin-lanc': FinLanc, 'fin-doacoes': FinDoacoes, 'fin-rel': FinRel, 'fin-conc': FinConc, 'fin-exp': FinExp, 'fin-cad': FinCad,
  'adm-igreja': AdmIgreja, 'adm-usuarios': AdmUsuarios, 'adm-identidade': AdmIdentidade, 'adm-plano': AdmPlano, 'adm-lgpd': AdmLgpd, 'adm-auditoria': AdmAuditoria,
};
const PARENT = { pessoa: 'pessoas', grupo: 'grupos', celebracao: 'celebracoes', 'pub-editor': 'publicacoes' };

function WebApp() {
  const [t, setTweak] = useTweaks(WEB_DEFAULTS);
  const [page, setPage] = React.useState(() => localStorage.getItem('orb-web-page') || 'inicio');
  const go = p => { setPage(p); localStorage.setItem('orb-web-page', p); const m = document.getElementById('web-main'); if (m) m.scrollTop = 0; };
  const T = TERMS[t.term];
  const [base, param] = page.split(':');
  const navId = PARENT[base] || base;
  const nav = findNav(T, navId);
  const allowed = !nav || nav.roles.includes(t.role);
  React.useEffect(() => { document.documentElement.dataset.theme = t.theme; }, [t.theme]);
  const ctx = { ...t, T, setTheme: v => setTweak('theme', v), screenState: allowed ? t.screenState : 'sem acesso' };
  const Page = PAGES[base];
  const crumbs = [{ l: CHURCH.cong }];
  if (nav?.sec) crumbs.push({ l: nav.sec });
  if (nav) crumbs.push(PARENT[base] ? { l: nav.label, go: navId } : { l: nav.label });
  if (base === 'pessoa') crumbs.push({ l: (PEOPLE.find(p => p.id === +param) || {}).name });
  if (base === 'grupo') crumbs.push({ l: (GROUPS.find(p => p.id === +param) || {}).name });
  if (base === 'celebracao') crumbs.push({ l: (CELEBS.find(p => p.id === +param) || {}).name });
  if (base === 'pub-editor') crumbs.push({ l: 'Nova publicação' });
  return (
    <OrbCtx.Provider value={ctx}>
      <div className={t.origin ? '' : 'no-otags'} style={{ '--brand': t.brand, height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div className="row" style={{ height: 30, padding: '0 16px', gap: 10, background: 'var(--subtle)', borderBottom: '1px solid var(--border)', fontSize: 12, flexShrink: 0 }}><Ic n="lock" s={12} className="muted" /><span className="mono"><span className="muted">https://</span>vidanova.orbien.app<span className="muted">/{base === 'inicio' ? '' : (PARENT[base] || base) + (param ? '/' + param : '')}</span></span><div className="grow" /><span className="cap">Painel da igreja · o console da plataforma fica em <span className="mono">admin.orbien.app</span></span></div>
        {t.support && <div className="row" style={{ height: 34, background: 'var(--crimson)', color: '#fff', justifyContent: 'center', gap: 10, fontSize: 13, flexShrink: 0 }}><Ic n="shield" s={15} /><b style={{ fontWeight: 500 }}>Sessão de suporte Orbien ativa</b><span style={{ opacity: .85 }}>· aberta por admin.orbien.app · Chamado #4821 · iniciada 11h40 · tudo fica registrado na Auditoria</span><button className="btn sm" style={{ background: 'rgba(255,255,255,.18)', color: '#fff', height: 24, marginLeft: 8 }}>Encerrar sessão</button></div>}
        <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}><div className="orb-bg"><i></i><i></i><i></i></div>
          <Sidebar page={page} go={go} />
          <div className="col grow" style={{ minHeight: 0 }}>
            <Topbar crumbs={crumbs} go={go} setRole={v => { setTweak('role', v); }} />
            <main id="web-main" className="scroll" style={{ flex: 1, overflow: 'auto', padding: '28px 32px 60px' }}>
              <div key={page + t.role} className="fade" style={{ maxWidth: 1240, margin: '0 auto' }}>
                {Page ? <Page id={param} go={go} /> : <GenericPage id={base} />}
              </div>
            </main>
          </div>
        </div>
      </div>
      <TweaksPanel>
        <TweakSection label="Demonstração" />
        <TweakSelect label="Papel" value={t.role} options={Object.entries(WEB_ROLES).map(([v, r]) => ({ value: v, label: r.label }))} onChange={v => setTweak('role', v)} />
        <TweakRadio label="Plano" value={t.plan} options={[{ value: 'starter', label: 'Starter' }, { value: 'premium', label: 'Premium' }]} onChange={v => setTweak('plan', v)} />
        <TweakSelect label="Estado da tela" value={t.screenState} options={['normal', 'carregando', 'vazio', 'erro', 'sem acesso']} onChange={v => setTweak('screenState', v)} />
        <TweakToggle label="Etiquetas de origem" value={t.origin} onChange={v => setTweak('origin', v)} />
        <TweakToggle label="Sessão de suporte" value={t.support} onChange={v => setTweak('support', v)} />
        <TweakSection label="Igreja" />
        <TweakColor label="Cor da igreja" value={t.brand} options={['#1E3A7B', '#8A2035', '#1F6B4A', '#5B3FA0']} onChange={v => setTweak('brand', v)} />
        <TweakRadio label="Termo do grupo" value={t.term} options={['Célula', 'PG', 'GC']} onChange={v => setTweak('term', v)} />
        <TweakRadio label="Tema" value={t.theme} options={[{ value: 'light', label: 'Claro' }, { value: 'dark', label: 'Escuro' }]} onChange={v => setTweak('theme', v)} />
      </TweaksPanel>
    </OrbCtx.Provider>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<WebApp />);
