// App — Conteúdo, Bíblia, Célula
const FeedScreen = ({ nav }) => {
  const [f, setF] = React.useState('Tudo');
  const items = [
    { type: 'Destaque', title: 'Batismo nas águas · 31 de maio', sub: 'Inscrições até 24/05', pin: true, o: 'api' },
    { type: 'Devocional', title: 'Salmo 23 · O Senhor é meu pastor', sub: 'Leitura de 4 min', o: 'promessa', icon: 'sun' },
    { type: 'Pregação', title: 'Fé que permanece (parte 2)', sub: 'Pr. Daniel Alves · 42 min', o: 'promessa', icon: 'play', media: true },
    { type: 'Evento', title: 'Conferência de Jovens 2026', sub: 'Sáb 30/05 · 38 vagas restantes', o: 'existe', icon: 'calendar' },
    { type: 'Plano de leitura', title: 'Hebreus em 13 dias', sub: 'Dia 4 de 13', o: 'promessa', icon: 'book', progress: 30 },
    { type: 'Podcast', title: 'Conversas de quarta · ep. 18', sub: 'Spotify · 28 min', o: 'promessa', icon: 'mic' },
    { type: 'Oração', title: 'Pedido de oração da liderança', sub: 'Pela família Ferraz', o: 'promessa', icon: 'heart' },
  ];
  return (
    <>
      <AppHeader title="Conteúdo" right={<IconBtn n="calendar" />} />
      <div className="row scroll" style={{ gap: 6, padding: '0 16px 14px', overflowX: 'auto' }}>{['Tudo', 'Avisos', 'Pregações', 'Devocionais', 'Eventos', 'Estudos'].map(x => <button key={x} onClick={() => setF(x)} className="badge" style={{ height: 32, padding: '0 14px', fontSize: 13, background: f === x ? 'var(--fg)' : 'var(--subtle)', color: f === x ? 'var(--bg)' : 'var(--stone)' }}>{x}</button>)}</div>
      <AStateful empty={{ icon: 'megaphone', title: 'Nada publicado ainda', text: 'Avisos, pregações e devocionais da igreja aparecem aqui.' }}>
        <div className="col" style={{ gap: 12, padding: '0 16px 110px' }}>
          {items.map((it, i) => it.pin ? (
            <ACard key={i} onClick={() => nav.push('post')} style={{ padding: 0, overflow: 'hidden' }}>
              <div className="stripe" style={{ height: 150, display: 'flex', alignItems: 'flex-start', padding: 12 }}><span className="badge solid"><Ic n="star" s={11} />Fixado pela liderança</span></div>
              <div style={{ padding: 16 }}><div className="row" style={{ gap: 6 }}><span className="cap">{it.type}</span><O o={it.o} /></div><div style={{ fontWeight: 600, fontSize: 17, marginTop: 2 }}>{it.title}</div><div className="cap">{it.sub}</div></div>
            </ACard>
          ) : (
            <ACard key={i} onClick={() => nav.push('post')} style={{ padding: 14 }}>
              <div className="row" style={{ gap: 12 }}>
                <div className={it.media ? 'stripe' : ''} style={{ width: 56, height: 56, borderRadius: 12, background: it.media ? undefined : 'var(--brand-dim)', color: 'var(--brand-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic n={it.icon} s={20} /></div>
                <div className="grow"><div className="row" style={{ gap: 6 }}><span className="cap">{it.type}</span><O o={it.o} /></div><div style={{ fontWeight: 500, lineHeight: 1.3 }}>{it.title}</div><div className="cap">{it.sub}</div>{it.progress && <div className="bar" style={{ marginTop: 6 }}><i style={{ width: it.progress + '%' }} /></div>}</div>
              </div>
            </ACard>
          ))}
        </div>
      </AStateful>
    </>
  );
};

const PostScreen = ({ nav }) => (
  <>
    <AppHeader back="Conteúdo" nav={nav} big={false} right={<IconBtn n="share" />} />
    <AStateful>
      <div style={{ padding: '0 0 110px' }}>
        <div className="stripe" style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="label">imagem do aviso</span></div>
        <div style={{ padding: 20 }}>
          <div className="row" style={{ gap: 6 }}><span className="badge brand">Aviso</span><span className="cap">12/05 · Secretaria</span></div>
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', marginTop: 10, lineHeight: 1.2 }}>Batismo nas águas · 31 de maio</h1>
          <p className="stone" style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6 }}>As inscrições para o batismo estão abertas até 24/05. Converse com seu líder de célula ou procure a secretaria depois do culto. Haverá uma aula preparatória no sábado, 23/05, às 15h.</p>
          <div className="row" style={{ gap: 8, marginTop: 20 }}><button className="btn primary lg grow">Quero me inscrever</button><button className="btn secondary lg"><Ic n="share" s={17} /><O o="proposta" /></button></div>
        </div>
      </div>
    </AStateful>
  </>
);

const VERSES = ['Ora, a fé é a certeza daquilo que esperamos e a prova das coisas que não vemos.', 'Pois foi por meio dela que os antigos receberam bom testemunho.', 'Pela fé entendemos que o universo foi formado pela palavra de Deus, de modo que aquilo que se vê não foi feito do que é visível.', 'Pela fé Abel ofereceu a Deus um sacrifício superior ao de Caim. Pela fé ele foi reconhecido como justo, quando Deus aprovou as suas ofertas.', 'Pela fé Enoque foi arrebatado, de modo que não experimentou a morte; e já não foi encontrado, porque Deus o havia arrebatado.', 'Sem fé é impossível agradar a Deus, pois quem dele se aproxima precisa crer que ele existe e que recompensa aqueles que o buscam.'];
const BibliaScreen = ({ nav }) => {
  const [tab, setTab] = React.useState('ler');
  const [sel, setSel] = React.useState([0]);
  const [fs, setFs] = React.useState(17);
  const toggle = i => setSel(s => s.includes(i) ? s.filter(x => x !== i) : [...s, i]);
  return (
    <>
      <AppHeader title="Bíblia" over="NVI" right={<><IconBtn n="search" /><IconBtn n="bookmark" /></>} />
      <div style={{ padding: '0 16px 12px' }}><Seg value={tab} onChange={setTab} options={[['ler', 'Ler'], ['marcacoes', 'Marcações da igreja'], ['planos', 'Planos']]} /></div>
      <AStateful empty={{ icon: 'book', title: 'Nenhuma marcação ainda', text: 'Marque um versículo e comente para compartilhar com a congregação.' }}>
        {tab === 'ler' && (
          <div style={{ padding: '0 20px 180px', position: 'relative' }}>
            <div className="row" style={{ gap: 8, marginBottom: 14 }}><button className="btn secondary sm" style={{ borderRadius: 99 }}>Hebreus<Ic n="chev-d" s={13} /></button><button className="btn secondary sm" style={{ borderRadius: 99 }}>Capítulo 11<Ic n="chev-d" s={13} /></button><div className="grow" /><button className="btn ghost sm" onClick={() => setFs(f => f === 17 ? 20 : 17)}>Aa<O o="proposta" /></button></div>
            <ACard style={{ background: 'var(--brand-dim)', border: 'none', marginBottom: 18, padding: 14 }}><div className="row" style={{ gap: 6 }}><span className="label" style={{ color: 'var(--brand-ink)' }}>Versículo do dia</span><O o="proposta" /></div><div style={{ marginTop: 4, fontSize: 14 }}>"O Senhor é o meu pastor; de nada terei falta." · Sl 23.1</div></ACard>
            {VERSES.map((v, i) => <p key={i} onClick={() => toggle(i)} style={{ fontSize: fs, lineHeight: 1.7, fontFamily: 'Georgia, serif', padding: '2px 4px', borderRadius: 6, marginBottom: 4, cursor: 'pointer', background: sel.includes(i) ? 'color-mix(in oklab,var(--brand) 16%,transparent)' : 'transparent', textDecoration: sel.includes(i) ? 'underline' : 'none', textDecorationColor: 'var(--brand-ink)', textUnderlineOffset: 4 }}><sup className="mono" style={{ fontSize: 10, color: 'var(--muted)', marginRight: 4 }}>{i + 1}</sup>{v}</p>)}
            {sel.length > 0 && <div className="card fade" style={{ position: 'absolute', left: 12, right: 12, bottom: 96, padding: 12, borderRadius: 16, boxShadow: 'var(--shadow-lg)' }}><div className="cap" style={{ marginBottom: 8 }}>Hebreus 11.{sel.map(x => x + 1).sort((a, b) => a - b).join(',')} · {sel.length} selecionado{sel.length > 1 ? 's' : ''}</div><div className="input" style={{ height: 40 }}><input placeholder="Escreva um comentário (opcional)" /></div><div className="row" style={{ gap: 8, marginTop: 8 }}><button className="btn primary sm grow">Marcar e compartilhar</button><button className="btn secondary sm"><Ic n="star" s={13} />Favorito<O o="proposta" /></button></div></div>}
          </div>
        )}
        {tab === 'marcacoes' && (
          <div className="col" style={{ gap: 12, padding: '0 16px 110px' }}>
            {[['Pedro Lima', 'Hb 11.1', VERSES[0], 'Essa é a definição que eu precisava ouvir essa semana.', 12, 3], ['Júlia Mendes', 'Hb 11.6', VERSES[5], 'Buscar é a parte que nos cabe.', 8, 1], ['Carla Souza', 'Sl 23.1-2', 'O Senhor é o meu pastor; de nada terei falta.', 'Para o nosso estudo de quarta.', 21, 6]].map(([n, r, v, c, l, rp], i) => <ACard key={i} style={{ padding: 14 }}><div className="row" style={{ gap: 10 }}><Av name={n} s={30} /><div className="grow"><div style={{ fontWeight: 500, fontSize: 14 }}>{n}</div><div className="cap">{r} · há {i + 1} h</div></div><button><Ic n="more" s={16} className="muted" /></button></div><p style={{ fontFamily: 'Georgia, serif', fontSize: 15, marginTop: 10, paddingLeft: 10, borderLeft: '2px solid var(--brand)' }}>{v}</p><p style={{ marginTop: 8, fontSize: 14 }}>{c}</p><div className="row cap" style={{ gap: 16, marginTop: 10 }}><span className="row" style={{ gap: 4 }}><Ic n="heart" s={14} />{l}</span><span className="row" style={{ gap: 4 }}><Ic n="msg" s={14} />{rp} respostas</span></div></ACard>)}
            <p className="cap" style={{ textAlign: 'center' }}>Líder, pastor e admin podem remover marcações e respostas.</p>
          </div>
        )}
        {tab === 'planos' && (
          <div className="col" style={{ gap: 12, padding: '0 16px 110px' }}>
            <div className="row cap" style={{ gap: 6 }}>Planos de leitura com progresso diário <O o="promessa" /></div>
            {[['Hebreus em 13 dias', 4, 13], ['Salmos de gratidão', 0, 7], ['Novo Testamento em 1 ano', 128, 365]].map(([t, d, n]) => <ACard key={t}><div style={{ fontWeight: 500 }}>{t}</div><div className="cap">{d ? `Dia ${d} de ${n}` : `${n} dias · não iniciado`}</div><div className="bar" style={{ marginTop: 10 }}><i style={{ width: d / n * 100 + '%' }} /></div>{d > 0 && <button className="btn primary sm" style={{ marginTop: 12 }}>Ler o dia {d + 1}</button>}</ACard>)}
          </div>
        )}
      </AStateful>
    </>
  );
};

const CelulaScreen = ({ nav }) => {
  const { role, T } = useOrb();
  const lead = isLeader(role);
  const [tab, setTab] = React.useState(lead ? 'lider' : 'encontros');
  const g = GROUPS[0];
  const tabs = [lead && ['lider', 'Liderar'], ['encontros', 'Encontros'], ['oracao', 'Oração'], ['chat', 'Chat'], ['sobre', 'Sobre']].filter(Boolean);
  return (
    <>
      <AppHeader title={g.name} over={`Minha ${T.sl} · ${g.day}`} right={<IconBtn n="qr" onClick={() => nav.push(lead ? 'qr' : 'scan')} />} />
      <div className="row scroll" style={{ gap: 6, padding: '0 16px 14px', overflowX: 'auto' }}>{tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className="badge" style={{ height: 32, padding: '0 14px', fontSize: 13, background: tab === k ? 'var(--fg)' : 'var(--subtle)', color: tab === k ? 'var(--bg)' : 'var(--stone)' }}>{l}</button>)}</div>
      <AStateful empty={{ icon: 'heart', title: `Você ainda não está em ${T.g === 'a' ? 'uma' : 'um'} ${T.sl}`, text: `Encontre ${T.g === 'a' ? 'uma' : 'um'} ${T.sl} perto de você e avise o líder que quer visitar.`, action: <button className="btn primary"><Ic n="pin" s={15} />Encontrar {T.sl}</button> }}>
        <div className="col" style={{ gap: 12, padding: '0 16px 110px' }}>
          {tab === 'lider' && <>
            <ACard onClick={() => nav.push('presenca')} style={{ background: 'var(--brand)', color: '#fff', border: 'none' }}><span className="label" style={{ color: 'rgba(255,255,255,.7)' }}>Hoje · 20h</span><div style={{ fontWeight: 600, fontSize: 17, marginTop: 4 }}>Registrar presença</div><div style={{ opacity: .8, fontSize: 13 }}>12 esperados · lembrete 24h depois se não registrar</div></ACard>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>{[['83%', 'presença'], ['3', 'visitantes'], ['R$ 412', 'oferta · mês']].map(([v, l]) => <ACard key={l} style={{ padding: 12 }}><div className="num" style={{ fontSize: 18, fontWeight: 500 }}>{v}</div><div className="cap">{l}</div></ACard>)}</div>
            <div className="row" style={{ gap: 6, padding: '4px 4px 0' }}><span className="label">Precisa de atenção</span><O o="api" /></div>
            <AList items={[
              { icon: 'user', label: 'Maria Vieira não vem há 3 semanas', sub: 'Toque para ligar ou mandar WhatsApp', tone: 'var(--amber)', onClick: () => { } },
              { icon: 'pin', label: '2 pedidos de visita', sub: 'Bianca Torres, Rafael Nogueira', tone: 'var(--teal)', onClick: () => { } },
              { icon: 'eye', label: '7 de 12 abriram o material', sub: 'Estudo 12 · A fé de Abraão', onClick: () => { } },
              { icon: 'edit', label: 'Editar encontro', sub: 'Tema, visitantes, oferta, observações', onClick: () => { } },
            ]} />
          </>}
          {tab === 'encontros' && <>
            <ACard><div className="row" style={{ gap: 6 }}><span className="label">Material de hoje</span><span className="badge teal" style={{ height: 19 }}>Novo</span></div><div style={{ fontWeight: 600, fontSize: 16, marginTop: 6 }}>Estudo 12 · A fé de Abraão</div><div className="cap">Hebreus 11.8-19 · texto formatado</div><div className="row" style={{ gap: 8, marginTop: 12 }}><button className="btn primary sm">Abrir estudo</button><button className="btn secondary sm"><Ic n="file" s={13} />PDF</button></div></ACard>
            {!lead && <ACard onClick={() => nav.push('scan')}><div className="row" style={{ gap: 12 }}><Ic n="camera" s={22} style={{ color: 'var(--brand-ink)' }} /><div className="grow"><div className="row" style={{ gap: 6, fontWeight: 500 }}>Fazer check-in<O o="api" /></div><div className="cap">Leia o QR que o líder mostra</div></div><Ic n="chev-r" s={16} className="muted" /></div></ACard>}
            <div className="label" style={{ padding: '4px 4px 0' }}>Anteriores</div>
            <AList items={[['Qua 13/05', 'Estudo 11 · Enoque e Noé'], ['Qua 06/05', 'Estudo 10 · Abel'], ['Qua 29/04', 'Estudo 9 · O que é fé']].map(([d, t]) => ({ label: t, sub: d, onClick: () => { } }))} />
          </>}
          {tab === 'oracao' && <>
            <button className="btn secondary lg" style={{ borderStyle: 'dashed' }}><Ic n="plus" s={16} />Novo pedido de oração<O o="api" /></button>
            {[['Júlia Mendes', 'Pelo emprego novo do meu marido.', false], ['Renata Alves', 'Cirurgia na sexta. Paz e recuperação.', true], ['Pedro Lima', 'Gratidão pela formatura do Lucas!', false]].map(([n, t, p]) => <ACard key={n} style={{ padding: 14 }}><div className="row" style={{ gap: 10 }}><Av name={n} s={28} /><span className="grow" style={{ fontWeight: 500, fontSize: 14 }}>{n}</span>{p && <span className="badge"><Ic n="lock" s={10} />Só liderança</span>}</div><p style={{ marginTop: 8, fontSize: 14 }}>{t}</p><button className="row cap" style={{ gap: 4, marginTop: 8 }}><Ic n="heart" s={13} />Estou orando</button></ACard>)}
          </>}
          {tab === 'chat' && <div className="col" style={{ gap: 10 }}>
            {[['Carla Souza', 'O estudo de hoje já está no app. Leiam o cap. 11 antes.', false], ['Pedro Lima', 'Levo o lanche!', false], ['Eu', 'Posso levar uma amiga hoje?', true], ['Carla Souza', 'Claro! Vai ser ótimo.', false]].map(([n, t, me], i) => <div key={i} style={{ alignSelf: me ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>{!me && <div className="cap" style={{ marginBottom: 2, marginLeft: 4 }}>{n}</div>}<div style={{ padding: '9px 13px', borderRadius: 16, background: me ? 'var(--brand)' : 'var(--surface)', color: me ? '#fff' : 'var(--fg)', border: me ? 'none' : '1px solid var(--border)', fontSize: 14 }}>{t}</div></div>)}
            <div className="input" style={{ height: 44, borderRadius: 22, marginTop: 8 }}><input placeholder="Mensagem" /><Ic n="send" s={17} style={{ color: 'var(--brand-ink)' }} /></div>
            <div className="row cap" style={{ gap: 6, justifyContent: 'center' }}>Chat fechado d{T.g} {T.sl} <O o="api" /></div>
          </div>}
          {tab === 'sobre' && <>
            <div className="stripe" style={{ height: 140, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="label">foto d{T.g} {T.sl}</span></div>
            <AList items={[{ icon: 'user', label: g.leader, sub: 'Líder' }, { icon: 'clock', label: g.day }, { icon: 'pin', label: g.address, sub: 'Abrir no mapa', onClick: () => { } }, { icon: 'users', label: 'Adultos', sub: 'Público-alvo' }]} />
            <p className="stone" style={{ fontSize: 14, padding: '0 4px' }}>Encontro semanal na casa da Carla. Estudamos o material da igreja, oramos juntos e comemos alguma coisa no fim.</p>
          </>}
        </div>
      </AStateful>
    </>
  );
};

const PresencaScreen = ({ nav }) => {
  const { T } = useOrb();
  const init = PEOPLE.filter(p => p.group === 'Vila Mariana').concat(PEOPLE.slice(4, 10)).slice(0, 12).map((p, i) => ({ ...p, on: i < 8 }));
  const [ppl, setPpl] = React.useState(init);
  const n = ppl.filter(p => p.on).length;
  return (
    <>
      <AppHeader back={T.s} nav={nav} title="Presença" over="Quarta · 14 de maio" />
      <AStateful>
        <div style={{ padding: '0 16px 160px' }}>
          <ACard style={{ marginBottom: 12 }}><div className="row" style={{ gap: 16 }}><div><div className="label">Presentes</div><div className="num" style={{ fontSize: 30, fontWeight: 500, color: 'var(--teal-ink)' }}>{n}<span className="muted" style={{ fontSize: 17 }}> / {ppl.length}</span></div></div><div className="grow"><div className="bar" style={{ height: 8 }}><i style={{ width: n / ppl.length * 100 + '%' }} /></div><div className="cap" style={{ marginTop: 6 }}>Todos vêm marcados. Toque para desmarcar.</div></div></div></ACard>
          <div className="card" style={{ borderRadius: 16, overflow: 'hidden' }}>
            {ppl.map((p, i) => <button key={p.id} onClick={() => setPpl(s => s.map(x => x.id === p.id ? { ...x, on: !x.on } : x))} className="row" style={{ width: '100%', padding: '10px 14px', gap: 12, borderBottom: i < ppl.length - 1 ? '1px solid var(--border)' : 'none', textAlign: 'left' }}><Av name={p.name} s={36} tone={p.bond === 'Visitante' ? 'teal' : ''} /><div className="grow"><div style={{ fontSize: 15 }}>{p.name}</div><div className="cap">{p.bond}{p.bond === 'Visitante' ? ' · 1ª vez' : ''}</div></div><span style={{ width: 28, height: 28, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', background: p.on ? 'var(--teal)' : 'transparent', border: p.on ? 'none' : '1.5px solid var(--border-strong)', color: '#fff' }}>{p.on && <Ic n="check" s={16} w={2.5} />}</span></button>)}
          </div>
          <button className="btn ghost" style={{ marginTop: 10 }}><Ic n="user-plus" s={15} />Adicionar visitante</button>
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 16px 34px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
          <button className="btn primary lg" style={{ width: '100%' }} onClick={() => nav.back()}><Ic n="check" s={17} />Registrar presença</button>
          <div className="cap" style={{ textAlign: 'center', marginTop: 6 }}>Se o envio falhar, as marcações ficam salvas.</div>
        </div>
      </AStateful>
    </>
  );
};

const QRScreen = ({ nav, auto }) => (
  <>
    <AppHeader back="Voltar" nav={nav} title={auto ? 'Autocadastro' : 'Check-in'} over={auto ? 'Para projetar no culto' : 'Encontro de hoje'} />
    <AStateful>
      <div className="col" style={{ alignItems: 'center', gap: 16, padding: '10px 24px 110px' }}>
        <div style={{ width: 250, height: 250, borderRadius: 24, background: '#fff', padding: 20, boxShadow: 'var(--shadow-md)' }}><div style={{ width: '100%', height: '100%', display: 'grid', gridTemplateColumns: 'repeat(9,1fr)', gap: 3 }}>{Array.from({ length: 81 }).map((_, i) => <div key={i} style={{ background: ((i * 37) % 7 < 3 || [0, 1, 2, 9, 18, 6, 7, 8, 17, 26, 54, 63, 72, 73, 74].includes(i)) ? '#0F1117' : 'transparent', borderRadius: 2 }} />)}</div></div>
        {auto ? <><div style={{ fontWeight: 600, fontSize: 17 }}>Origem: Culto da manhã</div><p className="stone" style={{ textAlign: 'center', fontSize: 14 }}>O visitante lê o QR e preenche nome, WhatsApp e consentimento numa página web, sem instalar o app.</p><Seg value="culto" onChange={() => { }} options={[['culto', 'Culto'], ['pg', 'PG'], ['ev', 'Evento']]} /></>
          : <><div style={{ fontWeight: 600, fontSize: 17 }}>Válido até 00h12</div><p className="stone" style={{ textAlign: 'center', fontSize: 14 }}>Os membros leem este código com a câmera do app. Vale 4 horas.</p><div className="row cap" style={{ gap: 6 }}><span className="num" style={{ fontSize: 15, color: 'var(--fg)', fontWeight: 500 }}>6</span> check-ins até agora</div><button className="btn secondary"><Ic n="refresh" s={15} />Renovar código</button></>}
      </div>
    </AStateful>
  </>
);

const ScanScreen = ({ nav }) => {
  const [done, setDone] = React.useState(false);
  return (
    <div style={{ height: '100%', background: '#0B0C10', color: '#fff', position: 'relative' }}>
      <div style={{ padding: '58px 16px 0' }}><button onClick={() => nav.back()} className="row" style={{ gap: 2, fontSize: 15 }}><Ic n="chev-l" s={22} />Voltar</button></div>
      {!done ? <div className="col" style={{ alignItems: 'center', gap: 22, marginTop: 70 }}>
        <div onClick={() => setDone(true)} style={{ width: 240, height: 240, borderRadius: 28, border: '3px solid rgba(255,255,255,.85)', position: 'relative', cursor: 'pointer', background: 'repeating-linear-gradient(135deg,rgba(255,255,255,.04) 0 1px,transparent 1px 10px)' }}><div style={{ position: 'absolute', left: 16, right: 16, top: '50%', height: 2, background: 'var(--teal)', boxShadow: '0 0 16px var(--teal)' }} /></div>
        <div style={{ fontSize: 17, fontWeight: 500 }}>Aponte para o QR do líder</div><div style={{ opacity: .6, fontSize: 13 }}>Toque no quadro para simular a leitura</div>
      </div> : <div className="col fade" style={{ alignItems: 'center', gap: 14, marginTop: 120, padding: 24, textAlign: 'center' }}>
        <div style={{ width: 72, height: 72, borderRadius: 99, background: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic n="check" s={36} w={2.5} /></div>
        <div style={{ fontSize: 22, fontWeight: 600 }}>Presença confirmada</div><div style={{ opacity: .7 }}>Vila Mariana · quarta, 14 de maio</div>
        <button className="btn lg" style={{ background: '#fff', color: '#0F1117', marginTop: 16 }} onClick={() => nav.back()}>Concluir</button>
      </div>}
    </div>
  );
};

Object.assign(window, { FeedScreen, PostScreen, BibliaScreen, CelulaScreen, PresencaScreen, QRScreen, ScanScreen });
