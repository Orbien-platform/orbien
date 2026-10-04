// App mobile — shell, header, tab bar, login, home, mais, notificações
const APP_ROLES = {
  membro: { label: 'Membro', person: 'Júlia Mendes' },
  voluntario: { label: 'Voluntário', person: 'Lívia Prado' },
  lider: { label: 'Líder de célula', person: 'Carla Souza' },
  lidmin: { label: 'Líder de ministério', person: 'Roberto Lemos' },
  pastor: { label: 'Pastor', person: 'Daniel Alves' },
};
const isVol = r => r !== 'membro';
const isLeader = r => ['lider', 'pastor'].includes(r);

const AppHeader = ({ title, over, back, nav, right, big = true }) => (
  <div style={{ padding: '58px 20px 12px', flexShrink: 0 }}>
    <div className="row" style={{ justifyContent: 'space-between', minHeight: 36, marginBottom: big ? 8 : 0 }}>
      {back ? <button onClick={() => nav.back()} className="row" style={{ gap: 2, color: 'var(--brand-ink)', fontSize: 15, marginLeft: -6 }}><Ic n="chev-l" s={22} />{back}</button> : <div />}
      {!big && <div style={{ fontWeight: 600, fontSize: 16 }}>{title}</div>}
      <div className="row" style={{ gap: 6 }}>{right}</div>
    </div>
    {big && <>{over && <div className="label" style={{ marginBottom: 4 }}>{over}</div>}<h1 style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-.025em', lineHeight: 1.1 }}>{title}</h1></>}
  </div>
);
const IconBtn = ({ n, onClick, dot }) => <button onClick={onClick} style={{ width: 36, height: 36, borderRadius: 11, background: 'var(--subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}><Ic n={n} s={18} />{dot && <span style={{ position: 'absolute', top: 7, right: 8, width: 8, height: 8, borderRadius: 9, background: 'var(--crimson)', border: '2px solid var(--subtle)' }} />}</button>;
const ACard = ({ children, style, onClick }) => <div onClick={onClick} className="card" style={{ padding: 16, borderRadius: 16, cursor: onClick ? 'pointer' : 'default', ...style }}>{children}</div>;
const AList = ({ items }) => (
  <div className="card" style={{ borderRadius: 16, overflow: 'hidden' }}>
    {items.filter(Boolean).map((it, i, a) => (
      <button key={i} onClick={it.onClick} className="row" style={{ width: '100%', minHeight: 52, padding: '10px 16px', gap: 12, textAlign: 'left', borderBottom: i < a.length - 1 ? '1px solid var(--border)' : 'none' }}>
        {it.icon && <div style={{ width: 32, height: 32, borderRadius: 9, background: it.tone || 'var(--subtle)', color: it.tone ? '#fff' : 'var(--stone)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic n={it.icon} s={17} /></div>}
        <div className="grow"><div className="row" style={{ gap: 6, fontSize: 15 }}>{it.label}<O o={it.o} /></div>{it.sub && <div className="cap">{it.sub}</div>}</div>
        {it.right}{it.onClick && <Ic n="chev-r" s={16} className="muted" />}
      </button>
    ))}
  </div>
);
const AStateful = ({ empty, children }) => {
  const { screenState } = useOrb();
  if (screenState === 'sem conexão') return <StateBox icon="wifi" title="Sem conexão" text="Este recurso precisa de internet. Assim que a conexão voltar, a tela atualiza sozinha." action={<button className="btn secondary">Tentar de novo</button>} />;
  return <Stateful empty={empty}><div className="fade">{children}</div></Stateful>;
};

const TabBar = ({ tab, nav }) => {
  const { T } = useOrb();
  const tabs = [['home', 'Início', 'home'], ['feed', 'Conteúdo', 'megaphone'], ['biblia', 'Bíblia', 'book'], ['celula', T.s, 'heart'], ['mais', 'Mais', 'grid']];
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: 26, paddingTop: 8, background: 'color-mix(in oklab,var(--surface) 88%,transparent)', backdropFilter: 'blur(16px)', borderTop: '1px solid var(--border)', display: 'flex', zIndex: 20 }}>
      {tabs.map(([k, l, i]) => <button key={k} onClick={() => nav.tab(k)} className="col" style={{ flex: 1, alignItems: 'center', gap: 3, color: tab === k ? 'var(--brand-ink)' : 'var(--muted)', fontSize: 10.5, fontWeight: 500 }}><Ic n={i} s={23} w={tab === k ? 2 : 1.6} />{l}</button>)}
    </div>
  );
};

// ── Login
const LoginScreen = ({ nav }) => {
  const [step, setStep] = React.useState('form');
  const [err, setErr] = React.useState(false);
  React.useEffect(() => { if (step === 'theming') { const id = setTimeout(() => nav.login(), 1100); return () => clearTimeout(id); } }, [step]);
  if (step === 'theming') {
    return (
      <div className="col fade" style={{ height: '100%', alignItems: 'center', justifyContent: 'center', gap: 14, background: 'var(--brand)', color: '#fff' }}>
        <div style={{ width: 76, height: 76, borderRadius: 22, background: 'rgba(255,255,255,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 600 }}>VN</div>
        <div style={{ fontSize: 20, fontWeight: 600 }}>{CHURCH.name}</div>
        <div style={{ opacity: .75, fontSize: 13 }}>Aplicando a identidade da sua igreja…</div>
      </div>
    );
  }
  if (step === 'forgot') return (
    <div className="col" style={{ height: '100%' }}>
      <AppHeader nav={{ back: () => setStep('form') }} back="Entrar" title="Recuperar senha" />
      <div className="col" style={{ padding: '0 20px', gap: 14 }}>
        <p className="stone">Informe seu e-mail. Se houver uma conta, enviamos um link para criar uma nova senha.</p>
        <div className="input" style={{ height: 48, borderRadius: 12 }}><Ic n="mail" s={17} className="muted" /><input placeholder="seu@email.com" /></div>
        <button className="btn primary lg" onClick={() => setStep('sent')} style={{ background: '#1E3A7B' }}>Enviar link</button>
      </div>
    </div>
  );
  if (step === 'sent') return <div className="col" style={{ height: '100%', justifyContent: 'center', padding: 24 }}><StateBox icon="mail" title="Verifique seu e-mail" text="Se o endereço tiver uma conta, o link chega em alguns minutos." action={<button className="btn secondary" onClick={() => setStep('form')}>Voltar para entrar</button>} /></div>;
  return (
    <div className="col" style={{ height: '100%', padding: '96px 24px 40px' }}>
      <div className="row" style={{ gap: 10, color: 'var(--fg)' }}><OrbLogo s={30} /><span style={{ fontSize: 24 }}><span style={{ fontWeight: 300 }}>orbi</span><span style={{ fontWeight: 600 }}>en</span></span></div>
      <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-.025em', marginTop: 40, lineHeight: 1.15 }}>Entre com o e-mail cadastrado na sua igreja</h1>
      <p className="stone" style={{ marginTop: 8 }}>Não é preciso escolher a igreja. Sua conta já sabe qual é.</p>
      <div className="col" style={{ gap: 12, marginTop: 28 }}>
        <div className="input" style={{ height: 50, borderRadius: 12 }}><Ic n="mail" s={17} className="muted" /><input defaultValue="julia.mendes@gmail.com" /></div>
        <div className="input" style={{ height: 50, borderRadius: 12, borderColor: err ? 'var(--crimson)' : '' }}><Ic n="lock" s={17} className="muted" /><input type="password" defaultValue="••••••••" /></div>
        {err && <div style={{ color: 'var(--crimson-ink)', fontSize: 13 }}>E-mail ou senha incorretos.</div>}
        <button className="btn lg" style={{ background: '#1E3A7B', color: '#fff', marginTop: 4, height: 50, borderRadius: 12 }} onClick={() => setStep('theming')}>Entrar</button>
        <button onClick={() => setStep('forgot')} style={{ color: 'var(--stone)', fontSize: 14, marginTop: 4 }}>Esqueci a senha</button>
      </div>
      <div className="grow" />
    </div>
  );
};

// ── Início
const HomeApp = ({ nav }) => {
  const { role, T, plan } = useOrb();
  const p = APP_ROLES[role];
  const first = p.person.split(' ')[0];
  return (
    <>
      <div style={{ padding: '58px 20px 4px' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="row" style={{ gap: 10 }}><div style={{ width: 36, height: 36, borderRadius: 11, background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12 }}>VN</div><div style={{ lineHeight: 1.2 }}><div style={{ fontWeight: 500, fontSize: 14 }}>{CHURCH.name}</div><div className="cap">{CHURCH.cong}</div></div></div>
          <IconBtn n="bell" dot onClick={() => nav.push('notificacoes')} />
        </div>
        <h1 style={{ fontSize: 28, letterSpacing: '-.025em', marginTop: 22, fontWeight: 300 }}>Boa tarde, <b style={{ fontWeight: 600 }}>{first}</b></h1>
        <div className="row cap" style={{ gap: 6, marginTop: 2 }}>Quinta, 14 de maio · 3 notificações não lidas <O o="proposta" /></div>
      </div>
      <AStateful empty={{ icon: 'home', title: 'Tudo em dia', text: 'Sem escalas, encontros ou avisos novos por enquanto.' }}>
        <div className="col" style={{ gap: 14, padding: '18px 16px 110px' }}>
          <div onClick={() => nav.push('post')} className="stripe" style={{ position: 'relative', height: 220, borderRadius: 20, overflow: 'hidden', cursor: 'pointer', boxShadow: 'var(--shadow-md)', flexShrink: 0 }}>
            <span className="label" style={{ position: 'absolute', top: 14, right: 14 }}>imagem da publicação</span>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(10,12,18,.82) 0%, rgba(10,12,18,.35) 45%, transparent 70%)' }} />
            <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16, color: '#fff' }}>
              <div className="row" style={{ gap: 6 }}><span className="badge solid"><Ic n="star" s={11} />Destaque</span><span style={{ fontSize: 12, opacity: .8 }}>Aviso</span><O o="api" /></div>
              <div style={{ fontSize: 21, fontWeight: 600, letterSpacing: '-.02em', lineHeight: 1.2, marginTop: 8 }}>Batismo nas águas · 31 de maio</div>
              <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}><span style={{ fontSize: 13, opacity: .8 }}>Inscrições até 24/05</span><span className="row" style={{ gap: 5 }}>{[0, 1, 2].map(i => <span key={i} style={{ width: i === 0 ? 16 : 6, height: 6, borderRadius: 9, background: i === 0 ? '#fff' : 'rgba(255,255,255,.45)' }} />)}</span></div>
            </div>
          </div>
          {role === 'lider' && <ACard onClick={() => nav.push('presenca')} style={{ background: 'var(--brand)', color: '#fff', border: 'none' }}><div className="row" style={{ gap: 6 }}><span className="label" style={{ color: 'rgba(255,255,255,.7)' }}>Encontro hoje · 20h</span><O o="proposta" /></div><div style={{ fontSize: 18, fontWeight: 600, marginTop: 6 }}>{T.s} Vila Mariana</div><div style={{ opacity: .8, fontSize: 13, marginTop: 2 }}>Estudo 12 · A fé de Abraão · 7 de 12 abriram o material</div><div className="row" style={{ gap: 8, marginTop: 14 }}><button className="btn sm" style={{ background: '#fff', color: 'var(--brand)' }}>Registrar presença</button><button className="btn sm" style={{ background: 'rgba(255,255,255,.16)', color: '#fff' }} onClick={e => { e.stopPropagation(); nav.push('qr'); }}><Ic n="qr" s={14} />Mostrar QR</button></div></ACard>}
          {role === 'lidmin' && <ACard onClick={() => nav.push('celebracao')}><div className="row" style={{ gap: 6 }}><span className="label">Celebração deste domingo</span><O o="proposta" /></div><div style={{ fontSize: 17, fontWeight: 600, marginTop: 6 }}>Manhã · 10h00 · Fé que permanece</div><div className="row" style={{ gap: 6, marginTop: 10 }}><span className="badge teal">OC publicada</span><span className="badge amber">1 vaga no Som</span></div></ACard>}
          {role === 'pastor' && <ACard><div className="row" style={{ gap: 6 }}><span className="label">Semáforo d{T.g}s {T.pl}</span><O o="proposta" />{plan !== 'premium' && <PBadge />}</div>{plan === 'premium' ? <div className="row" style={{ gap: 18, marginTop: 12 }}>{[['green', 3, 'Saudáveis'], ['amber', 2, 'Atenção'], ['red', 1, 'Crítico']].map(([c, n, l]) => <div key={c} className="col" style={{ gap: 2 }}><div className="row" style={{ gap: 6 }}><span className={`dot ${c}`} /><span className="num" style={{ fontSize: 22, fontWeight: 500 }}>{n}</span></div><span className="cap">{l}</span></div>)}</div> : <p className="cap" style={{ marginTop: 6 }}>Disponível no Premium.</p>}</ACard>}
          {isVol(role) && <>
            <div className="row" style={{ justifyContent: 'space-between', padding: '4px 4px 0' }}><span className="label">Minhas próximas escalas</span><button onClick={() => nav.tab('mais', 'escalas')} style={{ color: 'var(--brand-ink)', fontSize: 13, fontWeight: 500 }}>Ver todas</button></div>
            <ACard>
              <div className="row" style={{ gap: 12 }}><div className="col" style={{ alignItems: 'center', width: 44 }}><span className="label">Dom</span><span className="num" style={{ fontSize: 22, fontWeight: 500 }}>17</span></div><div className="grow"><div style={{ fontWeight: 500 }}>Mídia · Projeção</div><div className="cap">Celebração da manhã · chegar 09h15</div></div><span className="badge amber">Pendente</span></div>
              <div className="row" style={{ gap: 8, marginTop: 14 }}><button className="btn primary grow">Confirmar</button><button className="btn secondary grow">Recusar</button><button className="btn secondary" onClick={() => nav.push('troca')}><Ic n="swap" s={15} /></button></div>
            </ACard>
            <button onClick={() => nav.push('indisp')} className="row" style={{ gap: 8, padding: '0 6px', color: 'var(--stone)', fontSize: 13.5 }}><Ic n="calendar" s={15} />Informar indisponibilidade</button>
          </>}
          <div className="row" style={{ justifyContent: 'space-between', padding: '4px 4px 0' }}><span className="label">Meus grupos</span></div>
          <ACard onClick={() => nav.tab('celula')}><div className="row" style={{ gap: 12 }}><div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--brand-dim)', color: 'var(--brand-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic n="heart" s={19} /></div><div className="grow"><div style={{ fontWeight: 500 }}>{T.s} Vila Mariana</div><div className="cap">Quarta · 20h · Estudo 12 disponível</div></div><Ic n="chev-r" s={16} className="muted" /></div></ACard>
          <div className="row" style={{ justifyContent: 'space-between', padding: '4px 4px 0' }}><span className="label">Avisos</span><button onClick={() => nav.tab('feed')} style={{ color: 'var(--brand-ink)', fontSize: 13, fontWeight: 500 }}>Ver feed</button></div>
          {POSTS.filter(x => x.status === 'Publicado').slice(0, 3).map(x => <ACard key={x.id} onClick={() => nav.push('post')} style={{ padding: 14 }}><div className="row" style={{ gap: 12 }}><div className="stripe" style={{ width: 52, height: 52, borderRadius: 10 }} /><div className="grow"><span className="cap">{x.type}</span><div style={{ fontWeight: 500, lineHeight: 1.3 }}>{x.title}</div></div></div></ACard>)}
          <ACard style={{ padding: 14 }}><div className="row" style={{ gap: 12 }}><Ic n="calendar" s={20} style={{ color: 'var(--brand-ink)' }} /><div className="grow"><div className="cap">Inscrito · sáb 30/05</div><div style={{ fontWeight: 500 }}>Conferência de Jovens 2026</div></div><O o="proposta" /></div></ACard>
        </div>
      </AStateful>
    </>
  );
};

// ── Mais
const MaisScreen = ({ nav }) => {
  const { role } = useOrb();
  const p = APP_ROLES[role];
  return (
    <>
      <AppHeader title="Mais" />
      <div className="col" style={{ gap: 16, padding: '4px 16px 110px' }}>
        <ACard onClick={() => nav.push('perfil')}><div className="row" style={{ gap: 12 }}><Av name={p.person} s={48} /><div className="grow"><div style={{ fontWeight: 600, fontSize: 16 }}>{p.person}</div><div className="cap">{p.label} · {CHURCH.cong}</div></div><Ic n="chev-r" s={16} className="muted" /></div></ACard>
        <AList items={[
          isVol(role) && { icon: 'grid', label: 'Minhas escalas', sub: '1 pendente', onClick: () => nav.push('escalas'), o: 'existe' },
          isVol(role) && { icon: 'calendar', label: 'Celebrações', sub: 'OC e setlist', onClick: () => nav.push('celebracao'), o: 'existe' },
          { icon: 'pix', label: 'Contribuir', sub: 'Dízimo, oferta, missões', onClick: () => nav.push('doar'), o: 'api' },
          { icon: 'bell', label: 'Notificações', sub: '3 não lidas', onClick: () => nav.push('notificacoes'), o: 'existe' },
        ]} />
        {isLeader(role) && <><div className="label" style={{ padding: '0 4px' }}>Liderança</div><AList items={[
          { icon: 'user-plus', label: 'Cadastrar visitante', onClick: () => nav.push('visitante'), o: 'api' },
          { icon: 'qr', label: 'QR de autocadastro', sub: 'Para projetar no culto', onClick: () => nav.push('qrauto'), o: 'api' },
        ]} /></>}
        <AList items={[{ icon: 'lock', label: 'Privacidade e meus dados', onClick: () => nav.push('lgpd'), o: 'promessa' }, { icon: 'logout', label: 'Sair', onClick: () => nav.logout() }]} />
      </div>
    </>
  );
};

// ── Notificações
const NotifScreen = ({ nav }) => {
  const [tab, setTab] = React.useState('central');
  const { T } = useOrb();
  const items = [['grid', 'Escala publicada', 'Você está na Mídia · Dom 17/05 manhã', '2 min', true], ['msg', 'Pedro respondeu sua marcação', 'Hebreus 11.1 · "Amém, que palavra!"', '1 h', true], ['book', `Novo material d${T.g} ${T.sl}`, 'Estudo 12 · A fé de Abraão', '3 h', true], ['heart', `${T.s} amanhã`, 'Vila Mariana · quarta às 20h', 'ontem', false], ['receipt', 'Recibo de doação', 'Dízimo · R$ 450,00', '05/05', false]];
  const prefs = [['Escalas e trocas', true], ['Minha ' + T.sl, true], ['Respostas na Bíblia', true], ['Avisos da igreja', true], ['Aniversariantes', false], ['Vencimento do dízimo recorrente', true]];
  return (
    <>
      <AppHeader back="Voltar" nav={nav} title="Notificações" />
      <div style={{ padding: '0 16px 12px' }}><Seg value={tab} onChange={setTab} options={[['central', 'Central'], ['prefs', 'Preferências']]} /></div>
      <AStateful empty={{ icon: 'bell', title: 'Nenhuma notificação', text: 'Escalas, avisos e respostas aparecem aqui.' }}>
        <div style={{ padding: '0 16px 110px' }}>
          {tab === 'central' ? <div className="card" style={{ borderRadius: 16, overflow: 'hidden' }}>{items.map(([i, t, s, w, u], k) => <div key={k} className="row" style={{ gap: 12, padding: '13px 14px', borderBottom: k < items.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'flex-start' }}><div style={{ width: 34, height: 34, borderRadius: 10, background: u ? 'var(--brand-dim)' : 'var(--subtle)', color: u ? 'var(--brand-ink)' : 'var(--stone)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic n={i} s={16} /></div><div className="grow"><div style={{ fontWeight: u ? 600 : 400, fontSize: 14 }}>{t}</div><div className="cap">{s}</div></div><span className="cap">{w}</span></div>)}</div>
            : <div className="col" style={{ gap: 14 }}><div className="card" style={{ borderRadius: 16 }}>{prefs.map(([l, on], k) => <div key={l} className="row" style={{ padding: '12px 14px', borderBottom: k < prefs.length - 1 ? '1px solid var(--border)' : 'none' }}><span className="grow">{l}</span><Tog on={on} /></div>)}</div><div className="card row" style={{ borderRadius: 16, padding: '12px 14px' }}><div className="grow"><div className="row" style={{ gap: 6 }}>Silêncio das 22h às 7h<O o="promessa" /></div><div className="cap">Push chega na central, sem som</div></div><Tog on={true} /></div></div>}
        </div>
      </AStateful>
    </>
  );
};

Object.assign(window, { APP_ROLES, isVol, isLeader, AppHeader, IconBtn, ACard, AList, AStateful, TabBar, LoginScreen, HomeApp, MaisScreen, NotifScreen });
