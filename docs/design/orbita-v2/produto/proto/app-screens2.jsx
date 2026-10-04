// App — Escalas, Celebração, Doar, Perfil/LGPD, Visitante
const EscalasScreen = ({ nav }) => {
  const [tab, setTab] = React.useState('proximas');
  const list = [['Dom', '17', 'Mídia · Projeção', 'Manhã · chegar 09h15', 'pend'], ['Dom', '24', 'Mídia · Projeção', 'Noite · chegar 17h45', 'ok'], ['Qua', '27', 'Recepção', 'Culto de oração · 19h30', 'ok'], ['Dom', '31', 'Mídia · Transmissão', 'Manhã · chegar 09h15', 'troca']];
  return (
    <>
      <AppHeader back="Mais" nav={nav} title="Minhas escalas" />
      <div style={{ padding: '0 16px 12px' }}><Seg value={tab} onChange={setTab} options={[['proximas', 'Próximas'], ['trocas', 'Trocas'], ['perfil', 'Meu perfil']]} /></div>
      <AStateful empty={{ icon: 'grid', title: 'Sem escalas próximas', text: 'Quando o líder do ministério publicar a escala, você recebe um aviso.' }}>
        <div className="col" style={{ gap: 10, padding: '0 16px 110px' }}>
          {tab === 'proximas' && <>
            {list.map(([d, n, t, s, st], i) => <ACard key={i} style={{ padding: 14 }}>
              <div className="row" style={{ gap: 12 }}><div className="col" style={{ alignItems: 'center', width: 40 }}><span className="label">{d}</span><span className="num" style={{ fontSize: 21, fontWeight: 500 }}>{n}</span></div><div className="grow"><div style={{ fontWeight: 500 }}>{t}</div><div className="cap">{s}</div></div><span className={`badge ${ST[st][0]}`}>{st === 'ok' ? 'Confirmada' : ST[st][1]}</span></div>
              {st === 'pend' && <div className="row" style={{ gap: 8, marginTop: 12 }}><button className="btn primary sm grow">Confirmar</button><button className="btn secondary sm grow">Recusar</button><button className="btn secondary sm" onClick={() => nav.push('troca')}><Ic n="swap" s={14} />Trocar</button></div>}
              {st === 'ok' && i === 1 && <div className="row" style={{ gap: 8, marginTop: 12 }}><button className="btn teal sm grow"><Ic n="check" s={14} />Fazer check-in</button><span className="row cap" style={{ gap: 4 }}>QR ou localização<O o="promessa" /></span></div>}
            </ACard>)}
            <button className="btn secondary lg" onClick={() => nav.push('indisp')}><Ic n="calendar" s={16} />Informar indisponibilidade</button>
          </>}
          {tab === 'trocas' && <>
            <div className="row" style={{ gap: 6, padding: '0 4px' }}><span className="label">Pedidos para você</span><O o="api" /></div>
            <ACard><div className="row" style={{ gap: 10 }}><Av name="Caio Freitas" s={34} /><div className="grow"><div style={{ fontWeight: 500 }}>Caio pediu para trocar</div><div className="cap">Mídia · Dom 24/05 manhã ↔ sua Dom 31/05</div></div></div><div className="row" style={{ gap: 8, marginTop: 12 }}><button className="btn primary sm grow">Aceitar</button><button className="btn secondary sm grow">Recusar</button></div></ACard>
            <div className="label" style={{ padding: '6px 4px 0' }}>Enviados</div>
            <ACard><div className="row" style={{ gap: 10 }}><Ic n="swap" s={18} className="muted" /><div className="grow"><div style={{ fontWeight: 500 }}>Dom 31/05 · Transmissão</div><div className="cap">Aguardando Thiago Rocha</div></div><span className="badge amber">Pendente</span></div></ACard>
          </>}
          {tab === 'perfil' && <>
            <div className="row" style={{ gap: 6, padding: '0 4px' }}><span className="label">Meu perfil de voluntário</span><O o="api" /></div>
            <AList items={[{ icon: 'layers', label: 'Ministérios', sub: 'Mídia, Recepção' }, { icon: 'user', label: 'Funções', sub: 'Projeção, Transmissão, Porta' }, { icon: 'sparkles', label: 'Habilidades', sub: 'ProPresenter, OBS' }, { icon: 'clock', label: 'Disponibilidade semanal', sub: 'Dom manhã e noite · Qua', onClick: () => { } }]} />
            <AList items={[{ icon: 'chart', label: 'Histórico de serviço', sub: '2 anos e 3 meses · 96 escalas', o: 'promessa', onClick: () => { } }, { icon: 'file', label: 'Termo de voluntariado', sub: 'Aceito em 02/03/2024', o: 'promessa', onClick: () => { } }]} />
          </>}
        </div>
      </AStateful>
    </>
  );
};

const TrocaScreen = ({ nav }) => (
  <>
    <AppHeader back="Voltar" nav={nav} title="Pedir troca" over="Mídia · Dom 17/05 manhã" />
    <div className="col" style={{ gap: 12, padding: '0 16px 110px' }}>
      <div className="row" style={{ gap: 6, padding: '0 4px' }}><span className="label">Substitutos compatíveis</span><O o="api" /></div>
      <p className="cap" style={{ padding: '0 4px', marginTop: -6 }}>Sugeridos pela função e pela disponibilidade informada.</p>
      <AList items={[['Caio Freitas', 'Projeção · livre neste domingo'], ['Thiago Rocha', 'Projeção, Transmissão · livre'], ['Bianca Lopes', 'Projeção · serviu no domingo passado']].map(([n, s]) => ({ label: n, sub: s, right: <button className="btn secondary sm">Pedir</button> }))} />
      <div className="input" style={{ height: 46, borderRadius: 12 }}><input placeholder="Mensagem opcional" /></div>
      <button className="btn ghost">Pedir para qualquer um do ministério</button>
    </div>
  </>
);

const IndispScreen = ({ nav }) => (
  <>
    <AppHeader back="Voltar" nav={nav} title="Indisponibilidade" />
    <div className="col" style={{ gap: 14, padding: '0 16px 110px' }}>
      <ACard><div className="label" style={{ marginBottom: 10 }}>Período</div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><div className="input" style={{ height: 44 }}><Ic n="calendar" s={15} className="muted" /><input defaultValue="22/05/2026" /></div><div className="input" style={{ height: 44 }}><Ic n="calendar" s={15} className="muted" /><input defaultValue="02/06/2026" /></div></div><div className="input" style={{ height: 44, marginTop: 10 }}><input placeholder="Motivo (só a liderança vê)" defaultValue="Viagem em família" /></div></ACard>
      <div className="row" style={{ gap: 10, padding: 14, borderRadius: 14, background: 'var(--amber-dim)', color: 'var(--amber-ink)', fontSize: 13.5 }}><Ic n="alert" s={17} />Você está escalada em Dom 31/05. Peça troca antes de salvar.</div>
      <button className="btn primary lg">Salvar</button>
    </div>
  </>
);

const CelebracaoScreen = ({ nav }) => {
  const { role } = useOrb();
  const [tab, setTab] = React.useState('oc');
  const [live, setLive] = React.useState(false);
  const mine = role === 'lidmin' ? 0 : 2;
  if (live) return (
    <div style={{ height: '100%', background: '#0B0C10', color: '#fff', padding: '58px 20px 40px', display: 'flex', flexDirection: 'column' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}><button onClick={() => setLive(false)} className="row" style={{ gap: 2, fontSize: 15 }}><Ic n="chev-l" s={22} />Sair</button><span className="badge crimson"><span className="dot red" />Ao vivo</span></div>
      <div className="label" style={{ marginTop: 30, color: 'rgba(255,255,255,.55)' }}>Agora · desde 10h02</div>
      <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: '-.02em', marginTop: 6 }}>Louvor</div>
      <div style={{ opacity: .7 }}>Ministério de Louvor · 3ª de 4 músicas</div>
      <div className="bar" style={{ marginTop: 20, height: 8, background: 'rgba(255,255,255,.12)' }}><i style={{ width: '72%' }} /></div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 8, fontSize: 13 }}><span style={{ opacity: .6 }}>18 de 25 min</span><span style={{ color: '#E8C060' }}>+2 min do previsto</span></div>
      <div style={{ marginTop: 40, padding: 18, borderRadius: 18, background: 'rgba(255,255,255,.06)' }}><div className="label" style={{ color: 'rgba(255,255,255,.55)' }}>Próxima · 10h25</div><div style={{ fontSize: 19, fontWeight: 500, marginTop: 4 }}>Avisos</div><div style={{ opacity: .6, fontSize: 13 }}>Júlia Mendes · 5 min</div></div>
      <div className="grow" />
      <button className="btn lg" style={{ background: '#fff', color: '#0F1117' }}>Avançar etapa<Ic n="arrow-right" s={16} /></button>
      <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}><O o="proposta" /></div>
    </div>
  );
  return (
    <>
      <AppHeader back="Voltar" nav={nav} title="Celebração da manhã" over="Domingo · 17 de maio · 10h" right={role === 'lidmin' && <IconBtn n="play" onClick={() => setLive(true)} />} />
      <div style={{ padding: '0 16px 12px' }}><Seg value={tab} onChange={setTab} options={[['oc', 'Ordem'], ['setlist', 'Setlist'], ['equipe', 'Equipe']]} /></div>
      <AStateful empty={{ icon: 'music', title: 'Setlist ainda não publicado', text: 'O líder do louvor publica as músicas até sábado. Você recebe um aviso.' }}>
        <div className="col" style={{ gap: 10, padding: '0 16px 110px' }}>
          {tab === 'oc' && <>
            <ACard style={{ background: 'var(--brand-dim)', border: 'none', padding: 14 }}><div className="label" style={{ color: 'var(--brand-ink)' }}>Sua função</div><div style={{ fontWeight: 600, fontSize: 16, marginTop: 2 }}>{role === 'lidmin' ? 'Host · abertura às 09h55' : 'Mídia · Projeção · chegar 09h15'}</div></ACard>
            <div className="card" style={{ borderRadius: 16, overflow: 'hidden' }}>{OC_STEPS.map((s, i) => <div key={i} className="row" style={{ gap: 12, padding: '12px 14px', borderBottom: i < OC_STEPS.length - 1 ? '1px solid var(--border)' : 'none', background: i === mine ? 'color-mix(in oklab,var(--brand) 7%,transparent)' : 'transparent', borderLeft: i === mine ? '3px solid var(--brand)' : '3px solid transparent' }}><span className="mono" style={{ fontSize: 12.5, width: 42 }}>{s.t}</span><div className="grow"><div style={{ fontWeight: 500, fontSize: 14.5 }}>{s.name}</div><div className="cap">{s.who} · {s.d} min</div></div>{s.setlist && <button onClick={() => setTab('setlist')}><Ic n="music" s={16} style={{ color: 'var(--brand-ink)' }} /></button>}</div>)}</div>
            <button className="btn secondary"><Ic n="download" s={15} />PDF da OC<O o="api" /></button>
          </>}
          {tab === 'setlist' && SETLIST.map((s, i) => <ACard key={i} style={{ padding: 14 }}><div className="row" style={{ gap: 12 }}><span className="mono muted" style={{ width: 16 }}>{i + 1}</span><div className="grow"><div style={{ fontWeight: 500 }}>{s.title}</div><div className="row cap" style={{ gap: 10 }}><span>Tom <b className="mono" style={{ color: 'var(--fg)' }}>{s.key}</b></span><span>{s.bpm} BPM</span></div></div></div><div className="row" style={{ gap: 6, marginTop: 10, paddingLeft: 28 }}>{['Cifra', 'Letra', 'Vídeo'].map(l => <button key={l} className="btn secondary sm">{l}<Ic n="arrow-right" s={11} style={{ transform: 'rotate(-45deg)' }} /></button>)}</div></ACard>)}
          {tab === 'equipe' && Object.entries(ESCALA).slice(0, 3).map(([m, rows]) => <div key={m}><div className="label" style={{ padding: '6px 4px' }}>{m}</div><AList items={rows.map(r => ({ label: r[1] || 'Vaga aberta', sub: r[0] }))} /></div>)}
        </div>
      </AStateful>
    </>
  );
};

const DoarScreen = ({ nav }) => {
  const { plan } = useOrb();
  const [cat, setCat] = React.useState('Dízimo');
  const [anon, setAnon] = React.useState(false);
  const [val, setVal] = React.useState('450,00');
  const [step, setStep] = React.useState('form');
  return (
    <>
      <AppHeader back="Mais" nav={nav} title="Contribuir" right={<IconBtn n="receipt" onClick={() => setStep('hist')} />} />
      <AStateful>
        {step === 'form' && <div className="col" style={{ gap: 14, padding: '0 16px 110px' }}>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{['Dízimo', 'Oferta', 'Missões', 'Reforma do templo'].map(c => <button key={c} onClick={() => setCat(c)} className="badge" style={{ height: 34, padding: '0 14px', fontSize: 13.5, background: cat === c ? 'var(--brand)' : 'var(--subtle)', color: cat === c ? '#fff' : 'var(--stone)' }}>{c}</button>)}</div>
          {plan === 'premium' ? <ACard style={{ textAlign: 'center', padding: 22 }}><div className="label">Valor</div><div className="row" style={{ justifyContent: 'center', alignItems: 'baseline', gap: 6, marginTop: 6 }}><span className="stone" style={{ fontSize: 18 }}>R$</span><input value={val} onChange={e => setVal(e.target.value)} className="num" style={{ fontSize: 40, fontWeight: 500, width: 190, border: 'none', outline: 'none', background: 'transparent', textAlign: 'center' }} /></div></ACard>
            : <ACard><div className="label" style={{ marginBottom: 8 }}>Chave PIX da igreja</div><div className="row" style={{ gap: 8 }}><span className="mono grow" style={{ fontSize: 13 }}>financeiro@vidanova.org.br</span><button className="btn secondary sm"><Ic n="copy" s={13} />Copiar</button></div><p className="cap" style={{ marginTop: 10 }}>Pague no app do seu banco. No plano Starter, a doação não é identificada automaticamente.</p></ACard>}
          <div className="card row" style={{ borderRadius: 16, padding: '12px 14px' }}><div className="grow"><div>Doação anônima</div><div className="cap">{anon ? 'Sem recibo nominal' : 'Você recebe recibo e entra no carnê'}</div></div><Tog on={anon} onChange={setAnon} /></div>
          {plan === 'premium' && <button className="btn primary lg" onClick={() => setStep('qr')}><Ic n="pix" s={17} />Gerar PIX</button>}
          <div className="label" style={{ padding: '6px 4px 0' }}>Dízimo recorrente</div>
          {plan === 'premium' ? <ACard><div className="row" style={{ gap: 12 }}><div style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--teal-dim)', color: 'var(--teal-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic n="refresh" s={18} /></div><div className="grow"><div style={{ fontWeight: 500 }}>R$ 450,00 todo dia 5</div><div className="cap">PIX Automático · próximo em 05/06</div></div><span className="badge teal">Ativo</span></div><div className="row" style={{ gap: 8, marginTop: 12 }}><button className="btn secondary sm grow">Alterar</button><button className="btn secondary sm grow">Pausar</button><button className="btn ghost sm">Cancelar</button></div></ACard> : <PremiumInvite what="Dízimo recorrente com PIX Automático" />}
        </div>}
        {step === 'qr' && <div className="col fade" style={{ alignItems: 'center', gap: 14, padding: '0 24px 110px' }}>
          <div className="label">{cat} · {anon ? 'anônima' : 'identificada'}</div><div className="num" style={{ fontSize: 30, fontWeight: 500 }}>R$ {val}</div>
          <div style={{ width: 210, height: 210, borderRadius: 20, background: '#fff', padding: 16, boxShadow: 'var(--shadow-md)' }}><div style={{ width: '100%', height: '100%', display: 'grid', gridTemplateColumns: 'repeat(9,1fr)', gap: 3 }}>{Array.from({ length: 81 }).map((_, i) => <div key={i} style={{ background: (i * 53) % 5 < 2 ? '#0F1117' : 'transparent', borderRadius: 2 }} />)}</div></div>
          <button className="btn secondary" style={{ width: '100%' }}><Ic n="copy" s={15} />Copiar código PIX</button>
          <div className="row cap" style={{ gap: 6 }}><span className="dot amber" />Aguardando pagamento · confirmação automática</div>
          <button className="btn ghost" onClick={() => setStep('form')}>Voltar</button>
        </div>}
        {step === 'hist' && <div className="col fade" style={{ gap: 12, padding: '0 16px 110px' }}>
          <div className="row" style={{ justifyContent: 'space-between', padding: '0 4px' }}><div className="row" style={{ gap: 6 }}><span className="label">Meu histórico · só você vê</span><O o="promessa" /></div><button className="cap" onClick={() => setStep('form')}>Fechar</button></div>
          <AList items={[['Dízimo', '05/05/2026', 450], ['Missões', '21/04/2026', 100], ['Dízimo', '05/04/2026', 450], ['Oferta', '30/03/2026', 50]].map(([c, d, v]) => ({ label: c, sub: d, right: <span className="num">{brl(v)}</span> }))} />
          <AList items={[{ icon: 'receipt', label: 'Recibos em PDF', o: 'api', onClick: () => { } }, { icon: 'file', label: 'Carnê do dizimista 2025', sub: 'Para o Imposto de Renda', o: 'api', onClick: () => { } }]} />
        </div>}
      </AStateful>
    </>
  );
};

const PerfilScreen = ({ nav }) => {
  const { role } = useOrb();
  const p = PEOPLE.find(x => x.name === APP_ROLES[role].person) || PEOPLE[2];
  return (
    <>
      <AppHeader back="Mais" nav={nav} big={false} title="Meu perfil" right={<button style={{ color: 'var(--brand-ink)', fontWeight: 500 }}>Editar</button>} />
      <AStateful>
        <div className="col" style={{ gap: 14, padding: '4px 16px 110px' }}>
          <div className="col" style={{ alignItems: 'center', gap: 8 }}><div style={{ position: 'relative' }}><Av name={APP_ROLES[role].person} s={84} /><span style={{ position: 'absolute', right: -4, bottom: -4, width: 30, height: 30, borderRadius: 99, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic n="camera" s={15} /></span></div><div style={{ fontWeight: 600, fontSize: 19 }}>{APP_ROLES[role].person}</div><span className="badge brand">{p.bond} · desde {p.since}</span></div>
          <div className="row" style={{ gap: 6, padding: '6px 4px 0' }}><span className="label">Meus dados</span><O o="promessa" /></div>
          <AList items={[{ icon: 'phone', label: p.phone, sub: 'Telefone' }, { icon: 'mail', label: 'julia.mendes@gmail.com', sub: 'E-mail' }, { icon: 'pin', label: 'R. Afonso Celso, 512', sub: 'Endereço', onClick: () => { } }, { icon: 'bookmark', label: 'Batismo em 12/08/2019', sub: 'Dados eclesiásticos', onClick: () => { } }, { icon: 'users', label: 'Família', sub: 'Eduardo (cônjuge) · Sofia (filha)', onClick: () => { } }]} />
          <AList items={[{ icon: 'bell', label: 'Preferências de notificação', o: 'existe', onClick: () => nav.push('notificacoes') }, { icon: 'lock', label: 'Privacidade e meus dados', onClick: () => nav.push('lgpd') }]} />
        </div>
      </AStateful>
    </>
  );
};

const LgpdScreen = ({ nav }) => {
  const [del, setDel] = React.useState(false);
  return (
    <>
      <AppHeader back="Voltar" nav={nav} title="Privacidade" over="LGPD" />
      <AStateful>
        <div className="col" style={{ gap: 14, padding: '0 16px 110px' }}>
          <div className="row" style={{ gap: 6, padding: '0 4px' }}><span className="label">Consentimentos</span><O o="promessa" /></div>
          <div className="card" style={{ borderRadius: 16 }}>{[['Cadastro e contato pela igreja', true, true], ['Comunicações por WhatsApp', true], ['Uso de imagem em transmissões', false]].map(([l, on, req], i) => <div key={l} className="row" style={{ padding: '12px 14px', borderBottom: i < 2 ? '1px solid var(--border)' : 'none', gap: 10 }}><div className="grow"><div style={{ fontSize: 14.5 }}>{l}</div>{req && <div className="cap">Necessário para usar o app</div>}</div><Tog on={on} /></div>)}</div>
          <AList items={[{ icon: 'download', label: 'Exportar meus dados', sub: 'Pessoais, consentimentos, grupos e doações', o: 'promessa', onClick: () => { } }, { icon: 'file', label: 'Termos de uso da igreja', o: 'promessa', onClick: () => { } }, { icon: 'shield', label: 'Política de privacidade', o: 'promessa', onClick: () => { } }]} />
          {!del ? <button className="btn lg" style={{ color: 'var(--crimson-ink)', border: '1px solid var(--border)', background: 'var(--surface)' }} onClick={() => setDel(true)}>Pedir exclusão da conta<O o="api" /></button>
            : <ACard style={{ borderColor: 'var(--crimson)' }}><div style={{ fontWeight: 600 }}>Excluir minha conta?</div><p className="stone" style={{ fontSize: 13.5, marginTop: 4 }}>Seus dados são anonimizados em 30 dias. Até lá, você pode cancelar o pedido entrando no app.</p><div className="row" style={{ gap: 8, marginTop: 12 }}><button className="btn danger sm grow">Confirmar pedido</button><button className="btn secondary sm grow" onClick={() => setDel(false)}>Cancelar</button></div></ACard>}
        </div>
      </AStateful>
    </>
  );
};

const VisitanteScreen = ({ nav }) => {
  const [phone, setPhone] = React.useState('(11) 99876-0021');
  const [step, setStep] = React.useState('form');
  const [lgpd, setLgpd] = React.useState(true);
  const F = ({ l, children }) => <div><div className="label" style={{ marginBottom: 5 }}>{l}</div>{children}</div>;
  return (
    <>
      <AppHeader back="Mais" nav={nav} title="Novo visitante" />
      <AStateful>
        {step === 'form' && <div className="col" style={{ gap: 14, padding: '0 16px 110px' }}>
          <F l="Nome"><div className="input" style={{ height: 46, borderRadius: 12 }}><input defaultValue="André da Costa" /></div></F>
          <F l="Telefone / WhatsApp"><div className="input" style={{ height: 46, borderRadius: 12 }}><input value={phone} onChange={e => setPhone(e.target.value)} /></div></F>
          <F l="E-mail (opcional)"><div className="input" style={{ height: 46, borderRadius: 12 }}><input placeholder="email@exemplo.com" /></div></F>
          <F l="Sexo"><Seg value="M" onChange={() => { }} options={[['F', 'Feminino'], ['M', 'Masculino']]} /></F>
          <F l="Origem"><div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{['Culto', 'PG', 'Evento', 'Outro'].map((o, i) => <span key={o} className="badge" style={{ height: 32, padding: '0 14px', fontSize: 13, background: i === 0 ? 'var(--brand)' : 'var(--subtle)', color: i === 0 ? '#fff' : 'var(--stone)' }}>{o}</span>)}</div></F>
          <label className="row card" style={{ gap: 12, padding: 14, borderRadius: 14, alignItems: 'flex-start' }}><Tog on={lgpd} onChange={setLgpd} /><span style={{ fontSize: 13.5 }}>O visitante autoriza a igreja a guardar estes dados e entrar em contato. <span className="cap">Obrigatório</span></span></label>
          <button className="btn primary lg" disabled={!lgpd} onClick={() => setStep('dup')}>Cadastrar</button>
          <p className="cap" style={{ textAlign: 'center' }}>3 visitas em 60 dias tornam a pessoa frequentadora automaticamente.</p>
        </div>}
        {step === 'dup' && <div className="col fade" style={{ gap: 12, padding: '0 16px 110px' }}>
          <div className="row" style={{ gap: 10, padding: 14, borderRadius: 14, background: 'var(--amber-dim)', color: 'var(--amber-ink)' }}><Ic n="alert" s={18} /><span style={{ fontSize: 14 }}>Este telefone já está cadastrado.</span></div>
          <ACard><div className="row" style={{ gap: 12 }}><Av name="André Costa" s={42} tone="teal" /><div className="grow"><div style={{ fontWeight: 600 }}>André Costa</div><div className="cap">Frequentador · 4 visitas · última 27/04</div></div></div></ACard>
          <button className="btn primary lg" onClick={() => setStep('ok')}>Registrar nova visita</button>
          <button className="btn secondary lg">Abrir cadastro existente</button>
          <button className="btn ghost lg">É outra pessoa · criar novo</button>
        </div>}
        {step === 'ok' && <div className="col fade" style={{ alignItems: 'center', gap: 10, padding: '60px 24px', textAlign: 'center' }}><div style={{ width: 64, height: 64, borderRadius: 99, background: 'var(--teal)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic n="check" s={32} w={2.5} /></div><div style={{ fontSize: 20, fontWeight: 600 }}>Visita registrada</div><p className="stone">André Costa · Culto · hoje</p><button className="btn secondary" style={{ marginTop: 10 }} onClick={() => setStep('form')}>Cadastrar outro</button></div>}
      </AStateful>
    </>
  );
};

Object.assign(window, { EscalasScreen, TrocaScreen, IndispScreen, CelebracaoScreen, DoarScreen, PerfilScreen, LgpdScreen, VisitanteScreen });
