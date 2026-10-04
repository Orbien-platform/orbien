// Web — Cultos e serviço, Comunicação
const CelebracoesList = ({ go }) => (
  <>
    <PageHeader over="Cultos e serviço" title="Celebrações" o="existe" sub="Agenda das próximas celebrações. Cada uma tem página própria com OC, setlist e escala."
      actions={<><button className="btn secondary"><Ic n="layout" s={15} />Modelos</button><button className="btn primary"><Ic n="plus" s={15} />Nova celebração</button></>} />
    <Stateful empty={{ icon: 'calendar', title: 'Nenhuma celebração agendada', text: 'Crie uma celebração ou aplique um modelo recorrente.' }}>
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="tbl"><thead><tr><th>Data</th><th>Celebração</th><th>Tema</th><th>Host</th><th>OC</th><th>Escala</th></tr></thead>
          <tbody>{CELEBS.map(c => <tr key={c.id} className="click" onClick={() => go('celebracao:' + c.id)}>
            <td className="num" style={{ fontSize: 12.5 }}>{c.date}<div className="muted">{c.time}</div></td>
            <td style={{ fontWeight: 500 }}>{c.name}</td><td className="stone">{c.theme}</td><td className="stone">{c.host}</td>
            <td><span className={`badge ${c.status === 'OC publicada' ? 'teal' : ''}`}>{c.status}</span></td>
            <td>{c.open ? <span className="badge amber">{c.open} vagas abertas</span> : <span className="badge teal">Completa</span>}</td></tr>)}</tbody></table>
      </div>
    </Stateful>
  </>
);

const ESCALA = {
  Louvor: [['Ministro', 'Ana Reis', 'ok'], ['Violão', 'Caio Freitas', 'ok'], ['Teclado', 'Lívia Prado', 'pend'], ['Bateria', 'Igor Matos', 'ok'], ['Vocal', 'Júlia Mendes', 'ok']],
  Mídia: [['Projeção', 'Lívia Prado', 'troca'], ['Transmissão', 'Thiago Rocha', 'ok']],
  Som: [['Mesa', 'Bruno Reis', 'recusou'], ['Monitor', null, 'vaga']],
  Recepção: [['Porta principal', 'Pedro Lima', 'ok'], ['Porta principal', 'Renata Alves', 'pend'], ['Visitantes', 'Sônia Ramos', 'ok']],
  Infantil: [['Berçário', 'Vânia Santos', 'ok'], ['4 a 7 anos', 'Beatriz Lima', 'ok']],
};
const ST = { ok: ['teal', 'Confirmado'], pend: ['', 'Aguardando'], troca: ['amber', 'Troca pedida'], recusou: ['crimson', 'Recusou'], vaga: ['amber', 'Vaga aberta'] };

const CelebracaoPage = ({ id }) => {
  const { plan } = useOrb();
  const c = CELEBS.find(x => x.id === +id) || CELEBS[0];
  const [tab, setTab] = React.useState('oc');
  const content = {
    oc: (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          {OC_STEPS.map((s, i) => (
            <div key={i} className="row" style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)', gap: 14 }}>
              <Ic n="move" s={14} className="muted" style={{ cursor: 'grab' }} />
              <span className="mono" style={{ width: 48, fontSize: 12.5 }}>{s.t}</span>
              <span className="mono cap" style={{ width: 44 }}>{s.d} min</span>
              <div className="grow"><div style={{ fontWeight: 500 }}>{s.name}</div><div className="cap">{s.who} · {s.min}</div></div>
              {s.setlist && <span className="badge brand"><Ic n="music" s={11} />4 músicas</span>}
              <button className="btn ghost sm"><Ic n="more" s={14} /></button>
            </div>
          ))}
          <div className="row" style={{ padding: 12, gap: 8 }}><button className="btn ghost sm"><Ic n="plus" s={14} />Adicionar etapa</button><div className="grow" /><span className="cap">Duração total: 1h35 · termina 11h30</span></div>
        </div>
        <div className="col" style={{ gap: 16 }}>
          <Section title="Resumo">
            <div className="col" style={{ gap: 10 }}>{[['Tema', c.theme], ['Pregador', c.preacher], ['Host', c.host], ['Status', c.status]].map(([l, v]) => <div key={l} className="row"><span className="cap" style={{ width: 80 }}>{l}</span><span>{v}</span></div>)}</div>
          </Section>
          <Section title="Publicação" o="promessa">
            <p className="stone" style={{ fontSize: 13 }}>Ao publicar, a equipe escalada recebe aviso no app. O Host recebe lembrete 3 horas antes.</p>
            <div className="row" style={{ gap: 8, marginTop: 12 }}><button className="btn primary">Publicar OC</button><button className="btn secondary"><Ic n="download" s={14} />PDF da OC</button></div>
          </Section>
        </div>
      </div>
    ),
    setlist: (
      <div className="card" style={{ overflow: 'hidden', maxWidth: 820 }}>
        <table className="tbl"><thead><tr><th>#</th><th>Música</th><th>Tom</th><th>BPM</th><th>Links</th></tr></thead>
          <tbody>{SETLIST.map((s, i) => <tr key={i}><td className="mono muted">{i + 1}</td><td style={{ fontWeight: 500 }}>{s.title}</td><td className="mono">{s.key}</td><td className="mono">{s.bpm}</td><td><div className="row" style={{ gap: 6 }}>{['Cifra', 'Letra', 'Vídeo'].map(l => <span key={l} className="badge">{l}</span>)}</div></td></tr>)}</tbody></table>
        <div className="row" style={{ padding: 12, borderTop: '1px solid var(--border)' }}><button className="btn ghost sm"><Ic n="plus" s={14} />Do repertório</button></div>
      </div>
    ),
    escala: (
      <div className="col" style={{ gap: 14 }}>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn secondary"><Ic n="layout" s={15} />Aplicar modelo</button>
          {plan === 'premium' ? <button className="btn secondary"><Ic n="sparkles" s={15} />Sugerir escala</button> : <PremiumInvite inline />}
          <div className="grow" /><span className="cap">1 vaga · 1 recusa · 1 troca · 2 aguardando</span><button className="btn primary"><Ic n="send" s={15} />Publicar escala</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>
          {Object.entries(ESCALA).map(([min, rows]) => (
            <Section key={min} title={min} pad={0} right={<span className="cap num">{rows.filter(r => r[2] === 'ok').length}/{rows.length}</span>}>
              {rows.map((r, i) => <div key={i} className="row" style={{ padding: '10px 16px', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none', gap: 10 }}>
                {r[1] ? <Av name={r[1]} s={26} tone="gray" /> : <div style={{ width: 26, height: 26, borderRadius: 8, border: '1px dashed var(--border-strong)' }} />}
                <div className="grow"><div style={{ fontWeight: r[1] ? 500 : 400, color: r[1] ? 'var(--fg)' : 'var(--muted)' }}>{r[1] || 'Sem pessoa'}</div><div className="cap">{r[0]}</div></div>
                <span className={`badge ${ST[r[2]][0]}`}>{ST[r[2]][1]}</span></div>)}
            </Section>
          ))}
        </div>
      </div>
    ),
  };
  return (
    <>
      <PageHeader over={`${c.date} · ${c.time}`} title={c.name} o="proposta" sub={`${c.theme} · ${c.preacher}`} tab={tab} setTab={setTab}
        tabs={[['oc', 'Ordem de Celebração', 'existe'], ['setlist', 'Setlist', 'existe'], ['escala', 'Escala', 'existe']]}
        actions={<><span className={`badge ${c.status === 'OC publicada' ? 'teal' : ''}`}>{c.status}</span><button className="btn secondary"><Ic n="download" s={15} />PDF</button></>} />
      <Stateful>{content[tab]}</Stateful>
    </>
  );
};

const EscalasPage = () => {
  const { plan } = useOrb();
  const [min, setMin] = React.useState('todos');
  const dates = ['Dom 17/05 manhã', 'Dom 17/05 noite', 'Qua 20/05', 'Dom 24/05 manhã', 'Dom 24/05 noite', 'Dom 31/05 manhã'];
  const cell = (m, d) => { const k = (m.length * 7 + d * 3) % 9; return k === 0 ? 'vaga' : k === 4 ? 'recusou' : k === 6 ? 'pend' : k === 2 && d < 2 ? 'troca' : 'ok'; };
  const mins = min === 'todos' ? MINISTRIES : [min];
  return (
    <>
      <PageHeader over="Cultos e serviço" title="Escalas" o="api" sub="Visão por período e por ministério. Antes, a escala só era vista celebração por celebração."
        actions={<><button className="btn secondary"><Ic n="calendar" s={15} />17/05 – 31/05<Ic n="chev-d" s={13} /></button>{plan === 'premium' ? <button className="btn secondary"><Ic n="sparkles" s={15} />Sugerir</button> : <PremiumInvite inline />}<button className="btn primary"><Ic n="layers" s={15} />Gerar escalas do período</button></>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 14, marginBottom: 16 }}>
        <KPI label="Vagas abertas" value="5" /><KPI label="Recusas" value="3" /><KPI label="Trocas pendentes" value="2" /><KPI label="Aguardando confirmação" value="11" />
      </div>
      <div className="row" style={{ gap: 10, marginBottom: 12 }}><Seg value={min} onChange={setMin} options={[['todos', 'Todos'], ...MINISTRIES.map(m => [m, m])]} /><div className="grow" />{Object.entries(ST).map(([k, [t, l]]) => <span key={k} className="row cap" style={{ gap: 5 }}><span className={`dot ${t === 'teal' ? 'green' : t === 'amber' ? 'amber' : t === 'crimson' ? 'red' : 'gray'}`} />{l}</span>)}</div>
      <Stateful empty={{ icon: 'grid', title: 'Nenhuma escala no período', text: 'Gere as escalas do período a partir dos modelos recorrentes.' }}>
        <div className="card scroll" style={{ overflow: 'auto' }}>
          <table className="tbl" style={{ minWidth: 860 }}>
            <thead><tr><th>Ministério</th>{dates.map(d => <th key={d}>{d}</th>)}</tr></thead>
            <tbody>{mins.map(m => <tr key={m}><td style={{ fontWeight: 500 }}>{m}</td>{dates.map((d, i) => { const s = cell(m, i); const t = ST[s][0]; return <td key={d}><div className="row" style={{ gap: 6, padding: '6px 8px', borderRadius: 7, background: t === 'teal' ? 'transparent' : `var(--${t || 'subtle'}-dim, var(--subtle))` }}><span className={`dot ${t === 'teal' ? 'green' : t === 'amber' ? 'amber' : t === 'crimson' ? 'red' : 'gray'}`} /><span style={{ fontSize: 12.5 }} className={t === 'teal' ? 'stone' : ''}>{s === 'ok' ? `${4 + (i % 2)}/${4 + (i % 2)}` : ST[s][1]}</span></div></td>; })}</tr>)}</tbody>
          </table>
        </div>
      </Stateful>
    </>
  );
};

// Comunicação · Publicações
const PUB_TONE = { Publicado: 'teal', Agendado: 'brand', Rascunho: '' };
const PublicacoesPage = ({ go }) => {
  const [st, setSt] = React.useState('todos');
  const list = POSTS.filter(p => st === 'todos' || p.status === st);
  return (
    <>
      <PageHeader over="Comunicação" title="Publicações" o="existe" sub="Posts, devocionais e avisos que aparecem no feed do app."
        actions={<><button className="btn secondary"><Ic n="calendar" s={15} />Agendar mês de devocionais<O o="promessa" /></button><button className="btn primary" onClick={() => go('pub-editor')}><Ic n="plus" s={15} />Nova publicação</button></>} />
      <div className="row" style={{ gap: 10, marginBottom: 12 }}><Seg value={st} onChange={setSt} options={[['todos', 'Todas'], ['Rascunho', 'Rascunhos'], ['Agendado', 'Agendadas'], ['Publicado', 'Publicadas']]} /><div className="grow" /><span className="row cap" style={{ gap: 6 }}><Ic n="layers" s={13} />Conteúdo da denominação: 2 ocultos <O o="promessa" /></span></div>
      <Stateful empty={{ icon: 'megaphone', title: 'Nenhuma publicação', text: 'Escreva um aviso, um devocional ou publique a pregação de domingo.', action: <button className="btn primary" onClick={() => go('pub-editor')}>Nova publicação</button> }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="tbl"><thead><tr><th>Título</th><th>Tipo</th><th>Público</th><th>Status</th><th>Quando</th><th>Alcance</th></tr></thead>
            <tbody>{list.map(p => <tr key={p.id} className="click" onClick={() => go('pub-editor')}><td style={{ fontWeight: 500 }}>{p.title}</td><td className="stone">{p.type}</td><td className="stone">{p.aud}</td><td><span className={`badge ${PUB_TONE[p.status]}`}>{p.status}</span></td><td className="num stone" style={{ fontSize: 12.5 }}>{p.when}</td><td className="num">{p.reach ?? '—'}</td></tr>)}</tbody></table>
        </div>
      </Stateful>
    </>
  );
};

const PubEditor = () => {
  const [type, setType] = React.useState('Aviso');
  const [title, setTitle] = React.useState('Batismo nas águas · 31 de maio');
  const [txt, setTxt] = React.useState('As inscrições para o batismo estão abertas até 24/05. Converse com seu líder de célula ou procure a secretaria depois do culto.');
  const types = [['Aviso', 'existe'], ['Post', 'existe'], ['Evento', 'existe'], ['Vídeo', 'promessa'], ['Áudio', 'promessa'], ['PDF', 'promessa'], ['Devocional', 'promessa'], ['Plano de leitura', 'promessa'], ['Oração', 'promessa']];
  return (
    <>
      <PageHeader over="Comunicação · Publicações" title="Nova publicação" actions={<><button className="btn secondary">Salvar rascunho</button><button className="btn secondary"><Ic n="clock" s={15} />Agendar</button><button className="btn primary"><Ic n="send" s={15} />Publicar</button></>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 24, alignItems: 'start' }}>
        <div className="col" style={{ gap: 16 }}>
          <div><div className="label" style={{ marginBottom: 8 }}>Tipo</div><div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{types.map(([t, o]) => <button key={t} onClick={() => setType(t)} className="badge" style={{ height: 30, padding: '0 12px', fontSize: 12.5, gap: 6, background: type === t ? 'var(--brand)' : 'var(--subtle)', color: type === t ? '#fff' : 'var(--stone)' }}>{t}{o === 'promessa' && <span style={{ width: 5, height: 5, borderRadius: 9, background: '#8C5FC9' }} title="Promessa" />}</button>)}</div></div>
          <div className="card" style={{ padding: 0 }}>
            <input value={title} onChange={e => setTitle(e.target.value)} style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', fontSize: 20, fontWeight: 500, padding: '18px 20px 8px' }} />
            <div className="row" style={{ gap: 2, padding: '4px 14px', borderBottom: '1px solid var(--border)', borderTop: '1px solid var(--border)' }}>{['B', 'I', 'H2', '•', '1.', '🔗'].map(b => <button key={b} className="btn ghost sm" style={{ width: 30, padding: 0, fontWeight: b === 'B' ? 700 : 500, fontStyle: b === 'I' ? 'italic' : 'normal' }}>{b === '🔗' ? <Ic n="link" s={14} /> : b}</button>)}<div className="grow" /><button className="btn ghost sm"><Ic n="camera" s={14} />Mídia</button></div>
            <textarea value={txt} onChange={e => setTxt(e.target.value)} rows={8} style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', padding: 20, resize: 'vertical', lineHeight: 1.6 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Section title="Público" o="existe"><div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{['Frequentadores', 'Membros'].map(a => <span key={a} className="badge brand">{a}<Ic n="x" s={10} /></span>)}<button className="btn ghost sm"><Ic n="plus" s={13} />Segmento</button></div><div className="cap" style={{ marginTop: 10 }}>≈ 142 pessoas · notificar por push</div></Section>
            <Section title="Destaque no app"><div className="row" style={{ gap: 10 }}><Tog on={true} /><span>Fixar no início do app até 31/05</span></div></Section>
          </div>
        </div>
        <div style={{ position: 'sticky', top: 0 }}>
          <div className="row" style={{ marginBottom: 10, gap: 8 }}><span className="label">Pré-visualização no app</span><O o="promessa" /></div>
          <div style={{ borderRadius: 36, border: '8px solid var(--fg)', background: 'var(--bg)', height: 560, overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ padding: '34px 16px 14px' }}>
              <div className="label" style={{ fontSize: 9 }}>{CHURCH.name}</div>
              <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-.02em', marginTop: 2 }}>Conteúdo</div>
            </div>
            <div className="card" style={{ margin: '0 12px', overflow: 'hidden' }}>
              <div className="stripe" style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="label" style={{ fontSize: 9 }}>imagem do aviso</span></div>
              <div style={{ padding: 14 }}><span className="badge brand" style={{ height: 18, fontSize: 10 }}>{type}</span><div style={{ fontWeight: 600, fontSize: 15, marginTop: 8, lineHeight: 1.25 }}>{title}</div><p className="stone" style={{ fontSize: 12.5, marginTop: 6 }}>{txt}</p></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

Object.assign(window, { CelebracoesList, CelebracaoPage, EscalasPage, PublicacoesPage, PubEditor, ESCALA, ST });
