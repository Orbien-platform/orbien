// Web shell: nav, sidebar, topbar, page header, generic page, home by role
const WEB_ROLES = {
  pastor: { label: 'Pastor', person: 'Pr. Daniel Alves' },
  admin: { label: 'Admin da igreja', person: 'Marcos Teixeira' },
  secretaria: { label: 'Secretaria', person: 'Sônia Ramos' },
  tesoureiro: { label: 'Tesoureiro', person: 'Ricardo Nunes' },
  lidmin: { label: 'Líder de ministério', person: 'Roberto Lemos' },
  lider: { label: 'Supervisor / líder', person: 'Carla Souza' },
};
const ALL = ['pastor', 'admin', 'secretaria', 'tesoureiro', 'lidmin', 'lider'];
const NAV = (T) => [
  { sec: null, items: [{ id: 'inicio', label: 'Início', icon: 'home', roles: ALL }] },
  { sec: 'Pessoas', items: [
    { id: 'pessoas', label: 'Pessoas', icon: 'users', roles: ['pastor', 'admin', 'secretaria'], badge: '187' },
    { id: 'visitantes', label: 'Visitantes', icon: 'user-plus', roles: ['pastor', 'admin', 'secretaria'], badge: '3' },
    { id: 'familias', label: 'Famílias', icon: 'home', roles: ['pastor', 'admin', 'secretaria'] },
    { id: 'indicadores', label: 'Indicadores', icon: 'chart', roles: ['pastor', 'admin', 'secretaria'] },
  ] },
  { sec: 'Comunidade', items: [
    { id: 'grupos', label: T.p, icon: 'heart', roles: ['pastor', 'admin', 'secretaria', 'lider'] },
    { id: 'redes', label: 'Redes', icon: 'branch', roles: ['pastor', 'admin', 'lider'] },
    { id: 'materiais', label: 'Materiais', icon: 'book', roles: ['pastor', 'admin', 'lider'] },
    { id: 'saude', label: 'Saúde', icon: 'target', roles: ['pastor', 'admin', 'lider'], premium: true },
  ] },
  { sec: 'Cultos e serviço', items: [
    { id: 'celebracoes', label: 'Celebrações', icon: 'calendar', roles: ['pastor', 'admin', 'lidmin'] },
    { id: 'escalas', label: 'Escalas', icon: 'grid', roles: ['pastor', 'admin', 'lidmin'] },
    { id: 'ministerios', label: 'Ministérios', icon: 'layers', roles: ['pastor', 'admin', 'lidmin'] },
    { id: 'repertorio', label: 'Repertório', icon: 'music', roles: ['pastor', 'admin', 'lidmin'] },
    { id: 'modelos', label: 'Modelos', icon: 'layout', roles: ['admin', 'lidmin'] },
  ] },
  { sec: 'Comunicação', items: [
    { id: 'publicacoes', label: 'Publicações', icon: 'megaphone', roles: ['pastor', 'admin', 'secretaria'] },
    { id: 'eventos', label: 'Eventos', icon: 'calendar', roles: ['pastor', 'admin', 'secretaria'] },
    { id: 'destaques', label: 'Destaques do app', icon: 'star', roles: ['pastor', 'admin', 'secretaria'] },
    { id: 'notificacoes', label: 'Notificações', icon: 'bell', roles: ['pastor', 'admin', 'secretaria'] },
    { id: 'publicos', label: 'Públicos', icon: 'target', roles: ['pastor', 'admin', 'secretaria'] },
  ] },
  { sec: 'Financeiro', items: [
    { id: 'fin-geral', label: 'Visão geral', icon: 'chart', roles: ['pastor', 'admin', 'tesoureiro'] },
    { id: 'fin-lanc', label: 'Lançamentos', icon: 'list', roles: ['admin', 'tesoureiro'] },
    { id: 'fin-doacoes', label: 'Doações', icon: 'pix', roles: ['admin', 'tesoureiro'] },
    { id: 'fin-rel', label: 'Relatórios', icon: 'file', roles: ['pastor', 'admin', 'tesoureiro'], premium: true },
    { id: 'fin-conc', label: 'Conciliação', icon: 'bank', roles: ['admin', 'tesoureiro'], premium: true },
    { id: 'fin-exp', label: 'Exportação', icon: 'download', roles: ['admin', 'tesoureiro'], premium: true },
    { id: 'fin-cad', label: 'Cadastros', icon: 'tag', roles: ['admin', 'tesoureiro'] },
  ] },
  { sec: 'Administração', items: [
    { id: 'adm-igreja', label: 'Igreja e congregações', icon: 'bank', roles: ['admin'] },
    { id: 'adm-usuarios', label: 'Usuários e papéis', icon: 'shield', roles: ['admin'] },
    { id: 'adm-identidade', label: 'Identidade e domínio', icon: 'globe', roles: ['admin'] },
    { id: 'adm-plano', label: 'Plano e assinatura', icon: 'crown', roles: ['admin'] },
    { id: 'adm-lgpd', label: 'Privacidade (LGPD)', icon: 'lock', roles: ['admin'] },
    { id: 'adm-auditoria', label: 'Auditoria', icon: 'eye', roles: ['admin'] },
  ] },
];
const findNav = (T, id) => { for (const s of NAV(T)) for (const i of s.items) if (i.id === id) return { ...i, sec: s.sec }; return null; };

const Sidebar = ({ page, go }) => {
  const { role, T, plan } = useOrb();
  const base = page.split(':')[0];
  const parentOf = { pessoa: 'pessoas', grupo: 'grupos', celebracao: 'celebracoes', 'pub-editor': 'publicacoes' };
  const cur = parentOf[base] || base;
  return (
    <aside className="scroll" style={{ width: 236, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      <div className="row" style={{ gap: 10, padding: '16px 16px 14px', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 2 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 13 }}>VN</div>
        <div className="grow" style={{ lineHeight: 1.2 }}>
          <div style={{ fontWeight: 500, fontSize: 13.5 }} className="trunc">{CHURCH.name}</div>
          <button className="row cap" style={{ gap: 3 }}>{CHURCH.cong}<Ic n="chev-d" s={12} /></button>
        </div>
      </div>
      <nav className="col" style={{ padding: '4px 10px 12px', gap: 1 }}>
        {NAV(T).map((s, si) => {
          const items = s.items.filter(i => i.roles.includes(role));
          if (!items.length) return null;
          return (
            <div key={si} className="col" style={{ gap: 1, marginTop: s.sec ? 14 : 0 }}>
              {s.sec && <div className="label" style={{ padding: '0 8px 5px', fontSize: 9.5 }}>{s.sec}</div>}
              {items.map(i => {
                const on = cur === i.id;
                return (
                  <button key={i.id} onClick={() => go(i.id)} className="row" style={{ height: 32, padding: '0 8px', borderRadius: 7, gap: 9, fontSize: 13.5, textAlign: 'left', background: on ? 'var(--brand-dim)' : 'transparent', color: on ? 'var(--brand-ink)' : 'var(--stone)', fontWeight: on ? 500 : 400 }}
                    onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'var(--subtle)'; }} onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent'; }}>
                    <Ic n={i.icon} s={16} />
                    <span className="grow trunc">{i.label}</span>
                    {i.premium && plan === 'starter' && <Ic n="crown" s={12} style={{ opacity: .6 }} />}
                    {i.badge && <span className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>{i.badge}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>
      <div style={{ marginTop: 'auto', padding: 12, borderTop: '1px solid var(--border)' }} className="row">
        <OrbLogo s={16} /><span className="cap">orbien · plano <b style={{ fontWeight: 500, color: 'var(--stone)' }}>{plan === 'premium' ? 'Premium' : 'Starter'}</b></span>
      </div>
    </aside>
  );
};

const Topbar = ({ crumbs, go, setRole }) => {
  const { role, theme, setTheme } = useOrb();
  const [menu, setMenu] = React.useState(false);
  const r = WEB_ROLES[role];
  return (
    <header className="row" style={{ height: 56, padding: '0 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', gap: 16, flexShrink: 0 }}>
      <div className="row grow" style={{ gap: 6, fontSize: 13, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}>
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Ic n="chev-r" s={13} style={{ color: 'var(--muted)' }} />}
            {c.go ? <button className="stone" onClick={() => go(c.go)} style={{ fontSize: 13 }}>{c.l}</button> : <span className={i === crumbs.length - 1 ? 'trunc' : ''} style={{ color: i === crumbs.length - 1 ? 'var(--fg)' : 'var(--muted)', fontWeight: i === crumbs.length - 1 ? 500 : 400, minWidth: 0 }}>{c.l}</span>}
          </React.Fragment>
        ))}
      </div>
      <div className="input" style={{ flex: '0 1 260px', minWidth: 140, height: 34 }}><Ic n="search" s={15} style={{ color: 'var(--muted)' }} /><input placeholder="Buscar pessoa, grupo, lançamento…" /><span className="mono cap" style={{ fontSize: 10 }}>⌘K</span></div>
      <label className="row cap" style={{ gap: 6, whiteSpace: 'nowrap', flexShrink: 0 }}>Ver como
        <select value={role} onChange={e => setRole(e.target.value)} className="input" style={{ height: 30, fontSize: 12.5, padding: '0 6px' }}>
          {Object.entries(WEB_ROLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </label>
      <button className="btn ghost sm" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Tema"><Ic n={theme === 'dark' ? 'sun' : 'eye'} s={16} /></button>
      <button className="btn ghost sm" style={{ position: 'relative' }}><Ic n="bell" s={16} /><span style={{ position: 'absolute', top: 5, right: 7, width: 7, height: 7, borderRadius: 9, background: 'var(--crimson)' }} /></button>
      <div style={{ position: 'relative' }}>
        <button className="row" onClick={() => setMenu(!menu)} style={{ gap: 8 }}><Av name={r.person} s={30} /><Ic n="chev-d" s={13} className="muted" /></button>
        {menu && (
          <div className="card fade" style={{ position: 'absolute', right: 0, top: 40, width: 240, padding: 6, zIndex: 40, boxShadow: 'var(--shadow-lg)' }} onMouseLeave={() => setMenu(false)}>
            <div style={{ padding: '8px 10px 10px' }}><div style={{ fontWeight: 500 }}>{r.person}</div><div className="cap">{r.label} · {CHURCH.cong}</div></div>
            <div className="hr" />
            {[['user', 'Nome e e-mail'], ['lock', 'Trocar senha'], ['logout', 'Sair']].map(([i, l]) => <button key={l} className="row" style={{ width: '100%', height: 34, padding: '0 10px', borderRadius: 6, fontSize: 13 }}><Ic n={i} s={15} />{l}</button>)}
            <div className="cap" style={{ padding: '6px 10px 4px' }}>Escalas e perfil pessoal ficam no app.</div>
          </div>
        )}
      </div>
    </header>
  );
};

const PageHeader = ({ over, title, sub, actions, tabs, tab, setTab, o }) => (
  <div style={{ marginBottom: tabs ? 0 : 24 }}>
    <div className="row" style={{ alignItems: 'flex-end', gap: 16, marginBottom: tabs ? 18 : 0, flexWrap: 'wrap' }}>
      <div className="grow">
        {over && <div className="label" style={{ marginBottom: 6 }}>{over}</div>}
        <h1 className="row" style={{ fontSize: 26, letterSpacing: '-.02em', gap: 10 }}>{title}<O o={o} /></h1>
        {sub && <p className="stone" style={{ marginTop: 4 }}>{sub}</p>}
      </div>
      {actions && <div className="row" style={{ gap: 8 }}>{actions}</div>}
    </div>
    {tabs && <div className="tabs" style={{ marginBottom: 24 }}>{tabs.map(t => { const [v, l, o2] = t; return <button key={v} className={tab === v ? 'on' : ''} onClick={() => setTab(v)}>{l}{o2 && <O o={o2} />}</button>; })}</div>}
  </div>
);

const Section = ({ title, o, right, children, pad = 20, style }) => (
  <div className="card" style={{ overflow: 'hidden', ...style }}>
    {title && <div className="row" style={{ padding: `14px ${pad}px`, borderBottom: '1px solid var(--border)', gap: 8, flexWrap: 'wrap' }}><h3 style={{ fontSize: 14.5, whiteSpace: 'nowrap' }}>{title}</h3><O o={o} /><div className="grow" />{right}</div>}
    <div style={{ padding: pad }}>{children}</div>
  </div>
);
const KPI = ({ label, value, prefix, delta, up = true, sub, o }) => (
  <div className="card" style={{ padding: 18 }}>
    <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}><span className="label">{label}</span><O o={o} /></div>
    <div className="row" style={{ alignItems: 'baseline', gap: 4, marginTop: 10 }}>{prefix && <span className="stone">{prefix}</span>}<span className="num" style={{ fontSize: 26, fontWeight: 500, letterSpacing: '-.01em' }}>{value}</span></div>
    {(delta || sub) && <div className="row cap" style={{ marginTop: 4, gap: 6 }}>{delta && <span className="row" style={{ gap: 3, color: up ? 'var(--teal-ink)' : 'var(--crimson-ink)', fontWeight: 500 }}><Ic n={up ? 'trend-up' : 'trend-down'} s={13} />{delta}</span>}{sub}</div>}
  </div>
);
const TodoRow = ({ icon, title, sub, o, action, tone, onClick }) => (
  <div className="row" style={{ gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
    <div style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: tone === 'red' ? 'var(--crimson-dim)' : tone === 'amber' ? 'var(--amber-dim)' : 'var(--subtle)', color: tone === 'red' ? 'var(--crimson-ink)' : tone === 'amber' ? 'var(--amber-ink)' : 'var(--stone)' }}><Ic n={icon} s={16} /></div>
    <div className="grow"><div className="row" style={{ gap: 6 }}><span style={{ fontWeight: 500 }}>{title}</span><O o={o} /></div><div className="cap">{sub}</div></div>
    {action && <button className="btn secondary sm" onClick={onClick}>{action}</button>}
  </div>
);

// Generic page for menu items not detailed in this round — lists scope from the brief
const PLANNED = {
  visitantes: ['Chegadas recentes e follow-up', 'api', 'QR de autocadastro por origem (culto, PG, evento), para imprimir', 'api', 'Deduplicação por telefone', 'existe'],
  familias: ['Criar domicílio e vincular pessoas', 'api'],
  indicadores: ['Totais por vínculo, sexo e faixa etária', 'api', 'Filtros por congregação, período e vínculo', 'api'],
  redes: ['Redes e as células de cada rede', 'existe', 'Meta de multiplicação e progresso', 'existe', 'Árvore genealógica consolidada', 'existe'],
  saude: ['Semáforo de todas as células', 'api', 'Células estagnadas ou crescendo', 'api', 'Ausências consolidadas', 'api', 'Conversão visitante → membro originada em célula', 'promessa'],
  ministerios: ['Árvore de ministérios, membros e funções', 'existe', 'Disponibilidade dos voluntários', 'api', 'Histórico de serviço', 'promessa'],
  repertorio: ['Catálogo de músicas: título, tom, BPM e links', 'existe'],
  modelos: ['Templates de OC', 'existe', 'Templates de escala recorrente', 'existe'],
  eventos: ['Inscritos, vagas e prazo', 'existe', 'Lista de espera', 'existe', 'Pagamentos PIX (Premium)', 'existe'],
  destaques: ['O que aparece fixado no app', 'existe'],
  notificacoes: ['Envio manual com segmentação', 'existe', 'Histórico de envios', 'existe', 'Métricas de entrega, abertura e clique (Premium)', 'existe'],
  publicos: ['Segmentos básicos: idade, ministério, grupo, vínculo', 'existe', 'Segmentos por comportamento e inatividade (Premium)', 'existe'],
};
const GenericPage = ({ id }) => {
  const { T } = useOrb();
  const n = findNav(T, id);
  const f = PLANNED[id] || [];
  const rows = []; for (let i = 0; i < f.length; i += 2) rows.push([f[i], f[i + 1]]);
  return (
    <>
      <PageHeader over={n?.sec} title={n?.label} sub="Área prevista na nova estrutura. Detalhamento de tela na próxima rodada." />
      <Stateful>
        <div className="card" style={{ padding: 0, maxWidth: 720 }}>
          <div className="label" style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>Escopo desta área</div>
          {rows.map(([t, o], i) => <div key={i} className="row" style={{ padding: '12px 20px', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none', gap: 12 }}><span className="grow">{t}</span><O o={o} /></div>)}
        </div>
      </Stateful>
    </>
  );
};

// ── Início por papel
const HomeWeb = ({ go }) => {
  const { role, T, plan } = useOrb();
  const r = WEB_ROLES[role];
  const first = r.person.replace(/^(Pr\.|Pra\.)\s/, '').split(' ')[0];
  const lines = {
    pastor: '3 visitantes desde domingo · 2 ' + T.pl + ' em estado crítico · 1 prazo de LGPD vencendo.',
    admin: '3 visitantes desde domingo · 1 prazo de LGPD vencendo · 2 convites de acesso pendentes.',
    secretaria: '3 visitantes nesta semana · 2 possíveis duplicidades · 4 encontros sem presença.',
    tesoureiro: '6 lançamentos pendentes · 14 transações para conciliar · 2 assinaturas PIX com falha.',
    lidmin: '2 celebrações neste domingo · 4 vagas abertas na escala · 1 OC não publicada.',
    lider: 'Encontro hoje às 20h · presença da semana passada registrada · 1 pedido de visita.',
  }[role];
  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <div className="label" style={{ marginBottom: 6 }}>Quinta · 14 de maio · {r.label}</div>
        <h1 style={{ fontSize: 32, letterSpacing: '-.025em', fontWeight: 300 }}>Boa tarde, <b style={{ fontWeight: 600 }}>{first}</b></h1>
        <p className="stone" style={{ marginTop: 6 }}>{lines}</p>
      </div>
      <Stateful>
        {(role === 'pastor' || role === 'admin') && (
          <div className="col" style={{ gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 14 }}>
              <KPI label="Pessoas ativas" value="187" delta="+8" sub="novos no mês" o="existe" />
              <KPI label="Receitas · semana" value="13.880" prefix="R$" delta="+9%" sub="vs. semana anterior" o="existe" />
              <KPI label="Resultado líquido · mês" value="6.412" prefix="R$" sub="totais, sem nomes" o="existe" />
              <KPI label="Visitantes · 30 dias" value="21" delta="+5" o="existe" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 16 }}>
              <Section title="Precisa de você" o="api">
                <div style={{ marginTop: -12 }}>
                  <TodoRow icon="alert" tone="red" title={`${T.s} Saúde Família · crítico`} sub="Frequência 42% · sem relatório há 2 semanas" action="Abrir" onClick={() => go('grupo:4')} />
                  <TodoRow icon="user" tone="amber" title="Maria Vieira não vem há 3 semanas" sub={`${T.s} Moema Casais · alerta de ausência`} action="Contatar" />
                  <TodoRow icon="pin" title="2 pedidos de visita pendentes" sub={`Vindos de "Encontre ${T.g === 'a' ? 'uma' : 'um'} ${T.sl}"`} action="Ver" />
                  {role === 'admin' && <TodoRow icon="lock" tone="amber" title="Pedido de exclusão de dados vence em 4 dias" sub="Titular: Henrique Dias · LGPD" action="Resolver" onClick={() => go('adm-lgpd')} />}
                  {role === 'pastor' && <TodoRow icon="lock" tone="amber" title="Prazo de LGPD vencendo em 4 dias" sub="1 pedido de titular aguardando" />}
                </div>
              </Section>
              <Section title={`Semáforo d${T.g}s ${T.pl}`} o="api" right={<button className="btn ghost sm" onClick={() => go('grupos')}>Ver todos<Ic n="arrow-right" s={13} /></button>}>
                {plan === 'premium' ? (
                  <div className="col" style={{ gap: 12 }}>
                    {[['green', 'Saudáveis', 3], ['amber', 'Atenção', 2], ['red', 'Crítico', 1]].map(([c, l, n]) => (
                      <div key={c} className="row" style={{ gap: 10 }}><span className={`dot ${c}`} /><span className="grow">{l}</span><span className="num" style={{ fontSize: 18, fontWeight: 500 }}>{n}</span></div>
                    ))}
                    <div className="bar" style={{ display: 'flex', height: 8, marginTop: 4 }}><i style={{ width: '50%' }} /><i style={{ width: '33%', background: 'var(--amber)', borderRadius: 0 }} /><i style={{ width: '17%', background: 'var(--crimson)' }} /></div>
                  </div>
                ) : <PremiumInvite what="Semáforo de saúde dos grupos" />}
              </Section>
            </div>
            <Section title="Próxima celebração" o="existe" right={<button className="btn ghost sm" onClick={() => go('celebracao:1')}>Abrir<Ic n="arrow-right" s={13} /></button>}>
              <div className="row" style={{ gap: 24 }}>
                <div><div className="label">Dom · 17/05 · 10h00</div><div style={{ fontSize: 17, fontWeight: 500, marginTop: 4 }}>Celebração da manhã · Fé que permanece</div></div>
                <div className="grow" />
                <span className="badge teal">OC publicada</span><span className="badge amber">1 vaga aberta</span><span className="badge">2 aguardando confirmação</span>
              </div>
            </Section>
          </div>
        )}
        {role === 'secretaria' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16 }}>
            <Section title="Visitantes da semana" o="api" right={<button className="btn primary sm"><Ic n="user-plus" s={14} />Cadastrar</button>}>
              <div style={{ marginTop: -12 }}>{PEOPLE.filter(p => p.bond === 'Visitante').map(p => <TodoRow key={p.id} icon="user" title={p.name} sub={`${p.origin} · ${p.since}`} action="Ficha" onClick={() => go('pessoa:' + p.id)} />)}</div>
            </Section>
            <Section title="Duplicidades a resolver" o="api">
              <div style={{ marginTop: -12 }}>
                <TodoRow icon="copy" tone="amber" title="André Costa × André da Costa" sub="Mesmo telefone · (11) 99876-0021" action="Comparar" />
                <TodoRow icon="copy" tone="amber" title="Júlia Mendes × Julia M." sub="Mesmo e-mail" action="Comparar" />
              </div>
            </Section>
            <Section title="Encontros sem presença registrada" o="api" style={{ gridColumn: '1 / -1' }}>
              <div style={{ marginTop: -12 }}>{GROUPS.slice(2, 6).map(g => <TodoRow key={g.id} icon="clock" title={`${T.s} ${g.name}`} sub={`${g.day} · líder ${g.leader}`} action="Lembrar líder" />)}</div>
            </Section>
          </div>
        )}
        {role === 'tesoureiro' && (
          <div className="col" style={{ gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 14 }}>
              <KPI label="Entradas · semana" value="13.880" prefix="R$" delta="+9%" o="existe" />
              <KPI label="Lançamentos pendentes" value="6" sub="2 vencem hoje" o="existe" />
              <KPI label="A conciliar" value="14" sub="extrato de 13/05" o="api" />
            </div>
            <Section title="Precisa de você" o="api">
              <div style={{ marginTop: -12 }}>
                <TodoRow icon="pix" tone="red" title="2 assinaturas PIX com falha" sub="Dízimo recorrente · tentativa em 12/05" action="Ver" onClick={() => go('fin-doacoes')} />
                <TodoRow icon="bank" tone="amber" title="14 transações não conciliadas" sub="Importação OFX de 13/05" action="Conciliar" onClick={() => go('fin-conc')} />
                <TodoRow icon="inbox" title="5 intenções de doação da página pública" sub="Novidade: antes não apareciam para a tesouraria" o="promessa" action="Ver" onClick={() => go('fin-doacoes')} />
              </div>
            </Section>
          </div>
        )}
        {role === 'lidmin' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 16 }}>
            <Section title="Próximas celebrações" o="existe" pad={0}>
              {CELEBS.map(c => (
                <button key={c.id} className="row" onClick={() => go('celebracao:' + c.id)} style={{ width: '100%', padding: '14px 20px', borderBottom: '1px solid var(--border)', gap: 14, textAlign: 'left' }}>
                  <div className="mono" style={{ width: 92, fontSize: 12 }}>{c.date}<div className="muted">{c.time}</div></div>
                  <div className="grow"><div style={{ fontWeight: 500 }}>{c.name}</div><div className="cap">{c.theme}</div></div>
                  {c.open > 0 && <span className="badge amber">{c.open} vagas</span>}<span className={`badge ${c.status === 'OC publicada' ? 'teal' : ''}`}>{c.status}</span>
                </button>
              ))}
            </Section>
            <Section title="Escalas com problema" o="api">
              <div style={{ marginTop: -12 }}>
                <TodoRow icon="x" tone="red" title="Bruno Reis recusou · Som" sub="Dom 17/05 · noite" action="Substituir" onClick={() => go('escalas')} />
                <TodoRow icon="swap" tone="amber" title="Troca pedida · Mídia" sub="Lívia → Caio · Dom 17/05" action="Aprovar" />
                <TodoRow icon="file" title="OC da noite não publicada" sub="Dom 17/05 · 18h30" action="Abrir" onClick={() => go('celebracao:2')} />
              </div>
            </Section>
          </div>
        )}
        {role === 'lider' && (
          <div className="col" style={{ gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 14 }}>
              <KPI label="Presença média · 4 sem." value="83%" delta="+6 p.p." o="api" />
              <KPI label="Visitantes · mês" value="3" o="api" />
              <KPI label="Oferta · mês" value="412" prefix="R$" o="api" />
            </div>
            <Section title={`Minhas ${T.pl}`} o="api" pad={0}>
              {GROUPS.filter(g => g.net === 'Rede Sul').map(g => (
                <button key={g.id} onClick={() => go('grupo:' + g.id)} className="row" style={{ width: '100%', padding: '14px 20px', borderBottom: '1px solid var(--border)', gap: 14, textAlign: 'left' }}>
                  <div className="grow"><div style={{ fontWeight: 500 }}>{g.name}</div><div className="cap">{g.day} · {g.leader}</div></div>
                  <div style={{ width: 140 }}><div className="bar"><i style={{ width: g.att + '%', background: g.health === 'red' ? 'var(--crimson)' : g.health === 'amber' ? 'var(--amber)' : 'var(--teal)' }} /></div><div className="cap" style={{ marginTop: 4 }}>{g.att}% presença</div></div>
                  <div style={{ width: 90 }}><Health h={g.health} /></div>
                </button>
              ))}
            </Section>
          </div>
        )}
      </Stateful>
    </>
  );
};

Object.assign(window, { WEB_ROLES, NAV, findNav, Sidebar, Topbar, PageHeader, Section, KPI, TodoRow, GenericPage, HomeWeb });
