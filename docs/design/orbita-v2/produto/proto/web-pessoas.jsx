// Web — Pessoas, Comunidade
const BOND_TONE = { Visitante: 'teal', Frequentador: 'amber', Membro: 'brand' };

const PessoasList = ({ go }) => {
  const [q, setQ] = React.useState(''); const [bond, setBond] = React.useState('todos');
  const list = PEOPLE.filter(p => (bond === 'todos' || p.bond === bond) && p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHeader over="Pessoas" title="Pessoas" o="existe" sub="187 ativas · 21 visitantes nos últimos 30 dias"
        actions={<><button className="btn secondary"><Ic n="upload" s={15} />Importar CSV</button><button className="btn primary"><Ic n="user-plus" s={15} />Cadastrar visitante</button></>} />
      <div className="row" style={{ gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div className="input" style={{ width: 280 }}><Ic n="search" s={15} className="muted" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nome ou telefone" /></div>
        <Seg value={bond} onChange={setBond} options={[['todos', 'Todos'], ['Visitante', 'Visitantes'], ['Frequentador', 'Frequentadores'], ['Membro', 'Membros']]} />
        <div className="grow" />
        {['Origem', 'Sexo', 'Faixa etária', 'Data'].map(f => <button key={f} className="btn secondary sm">{f}<Ic n="chev-d" s={13} /></button>)}
        <O o="promessa" />
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <Stateful empty={{ icon: 'users', title: 'Nenhuma pessoa cadastrada', text: 'Importe uma planilha ou cadastre o primeiro visitante.', action: <button className="btn primary"><Ic n="upload" s={15} />Importar CSV</button> }} compact>
          <table className="tbl">
            <thead><tr><th>Nome</th><th>Vínculo</th><th>Origem</th><th>Grupo</th><th>Desde</th><th>Telefone</th><th></th></tr></thead>
            <tbody>{list.map(p => (
              <tr key={p.id} className="click" onClick={() => go('pessoa:' + p.id)}>
                <td><div className="row" style={{ gap: 10 }}><Av name={p.name} s={30} tone={p.bond === 'Visitante' ? 'teal' : ''} /><span style={{ fontWeight: 500 }}>{p.name}</span></div></td>
                <td><span className={`badge ${BOND_TONE[p.bond]}`}>{p.bond}</span></td>
                <td className="stone">{p.origin}</td><td className="stone">{p.group || '—'}</td>
                <td className="num stone" style={{ fontSize: 12.5 }}>{p.since}</td><td className="num stone" style={{ fontSize: 12.5 }}>{p.phone}</td>
                <td><Ic n="chev-r" s={15} className="muted" /></td>
              </tr>))}</tbody>
          </table>
        </Stateful>
      </div>
    </>
  );
};

const PessoaPage = ({ id, go }) => {
  const { role } = useOrb();
  const p = PEOPLE.find(x => x.id === +id) || PEOPLE[0];
  const canFin = ['tesoureiro', 'admin'].includes(role);
  const secs = [['dados', 'Dados pessoais', 'existe'], ['ecle', 'Dados eclesiásticos', 'promessa'], ['familia', 'Família', 'api'], ['vinculo', 'Vínculo e histórico', 'api'], ['visitas', 'Histórico de visitas', 'api'], ['presenca', 'Presença', 'promessa'], ['grupos', 'Grupos e ministérios', 'promessa'], ['contrib', 'Contribuições', 'promessa'], ['lgpd', 'Consentimentos', 'promessa'], ['acesso', 'Acesso', 'existe']];
  const [sec, setSec] = React.useState('dados');
  const F = ({ l, v }) => <div><div className="label" style={{ marginBottom: 3 }}>{l}</div><div>{v}</div></div>;
  const body = {
    dados: <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 18 }}><F l="Nome completo" v={p.name} /><F l="Telefone / WhatsApp" v={p.phone} /><F l="E-mail" v={p.name.split(' ')[0].toLowerCase() + '@gmail.com'} /><F l="Sexo" v={p.sex === 'F' ? 'Feminino' : 'Masculino'} /><F l="Idade" v={p.age + ' anos'} /><F l="Endereço" v="R. Afonso Celso, 512 · Vila Mariana" /></div>,
    ecle: <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 18 }}><F l="Batismo" v={p.bond === 'Membro' ? '12/08/2019' : '—'} /><F l="Membresia" v={p.bond === 'Membro' ? 'Desde ' + p.since : '—'} /><F l="Igreja anterior" v="—" /></div>,
    familia: <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>{[[p.name, 'Titular'], ['Eduardo ' + p.name.split(' ')[1], 'Cônjuge'], ['Sofia ' + p.name.split(' ')[1], 'Filha · 6 anos']].map(([n, r]) => <div key={n} className="row card" style={{ padding: '10px 14px', gap: 10, boxShadow: 'none' }}><Av name={n} s={30} tone="gray" /><div><div style={{ fontWeight: 500 }}>{n}</div><div className="cap">{r}</div></div></div>)}<button className="btn ghost sm"><Ic n="plus" s={14} />Vincular pessoa</button></div>,
    vinculo: <div className="col">{[['Visitante → Frequentador', 'Automático · 3 visitas em 60 dias', '02/04/2026'], ['Cadastro como Visitante', 'QR do culto · Sônia Ramos', '11/02/2026']].map(([a, b, c], i) => <div key={i} className="row" style={{ gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}><span className="dot gray" /><div className="grow"><div style={{ fontWeight: 500 }}>{a}</div><div className="cap">{b}</div></div><span className="num cap">{c}</span></div>)}<p className="cap" style={{ marginTop: 10 }}>Membro só é confirmado manualmente pela liderança.</p><div style={{ marginTop: 10 }}><button className="btn secondary sm">Confirmar como membro</button></div></div>,
    visitas: <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>{['11/05 · Culto manhã', '27/04 · Culto noite', '13/04 · ' + (p.group || 'Célula Vila Mariana'), '11/02 · Culto manhã'].map(v => <span key={v} className="badge">{v}</span>)}</div>,
    presenca: <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 4 }}>{Array.from({ length: 24 }).map((_, i) => <div key={i} title={'Semana ' + (i + 1)} style={{ height: 22, borderRadius: 4, background: [3, 7, 8, 15].includes(i) ? 'var(--subtle)' : 'color-mix(in oklab,var(--teal) 70%,var(--surface))' }} />)}<div className="cap" style={{ gridColumn: '1/-1', marginTop: 6 }}>Últimas 24 semanas · cultos e {p.group ? 'grupo' : 'eventos'}</div></div>,
    grupos: <div className="row" style={{ gap: 8 }}>{p.group && <span className="badge brand">{p.group}</span>}<span className="badge">Recepção · voluntário</span></div>,
    contrib: canFin ? <div className="row" style={{ gap: 28 }}><F l="Total 2026" v={<span className="num">R$ 3.240,00</span>} /><F l="Dízimo recorrente" v="Ativo · dia 5" /><F l="Último recibo" v="05/05/2026" /></div> : <div className="row stone" style={{ gap: 8 }}><Ic n="lock" s={15} />Visível só para quem tem permissão financeira.</div>,
    lgpd: <div className="col" style={{ gap: 8 }}>{[['Cadastro e contato pela igreja', '11/02/2026', true], ['Receber comunicações no WhatsApp', '11/02/2026', true], ['Uso de imagem', '—', false]].map(([a, b, on]) => <div key={a} className="row" style={{ gap: 10 }}><span className={`dot ${on ? 'green' : 'gray'}`} /><span className="grow">{a}</span><span className="cap num">{b}</span></div>)}</div>,
    acesso: <div className="row" style={{ gap: 12 }}><span className="badge">{p.role ? 'Líder de célula' : 'Membro (app)'}</span><span className="cap">Último acesso ao app: ontem, 21h14</span><div className="grow" /><button className="btn ghost sm" onClick={() => go('adm-usuarios')}>Gerir em Usuários e papéis<Ic n="arrow-right" s={13} /></button></div>,
  };
  return (
    <>
      <div className="row" style={{ gap: 18, marginBottom: 24, flexWrap: 'wrap' }}>
        <Av name={p.name} s={64} tone={p.bond === 'Visitante' ? 'teal' : ''} />
        <div className="grow">
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}><h1 style={{ fontSize: 26 }}>{p.name}</h1><span className={`badge ${BOND_TONE[p.bond]}`}>{p.bond}</span><O o="proposta" /></div>
          <p className="stone" style={{ marginTop: 3 }}>{p.origin} · desde {p.since}{p.group ? ' · ' + p.group : ''}</p>
        </div>
        <button className="btn secondary"><Ic n="phone" s={15} />Ligar</button><button className="btn secondary"><Ic n="msg" s={15} />WhatsApp</button><button className="btn primary"><Ic n="edit" s={15} />Editar</button><button className="btn ghost"><Ic n="more" s={16} /></button>
      </div>
      <Stateful>
        <div style={{ display: 'grid', gridTemplateColumns: '200px minmax(0,1fr)', gap: 24, alignItems: 'start' }}>
          <nav className="col" style={{ gap: 1, position: 'sticky', top: 0 }}>{secs.map(([k, l, o]) => <button key={k} onClick={() => setSec(k)} className="row" style={{ height: 32, padding: '0 10px', borderRadius: 7, gap: 6, textAlign: 'left', background: sec === k ? 'var(--subtle)' : 'transparent', fontWeight: sec === k ? 500 : 400, color: sec === k ? 'var(--fg)' : 'var(--stone)' }}><span className="grow">{l}</span>{k === 'contrib' && !canFin && <Ic n="lock" s={12} />}</button>)}
            <div className="hr" style={{ margin: '10px 0' }} /><button className="row" style={{ height: 32, padding: '0 10px', color: 'var(--crimson-ink)', gap: 6, fontSize: 13 }}>Anonimizar a pedido<O o="api" /></button></nav>
          <div className="col" style={{ gap: 16 }}>
            {secs.map(([k, l, o]) => <Section key={k} title={l} o={o} style={{ outline: sec === k ? '2px solid color-mix(in oklab,var(--brand) 25%,transparent)' : 'none' }}>{body[k]}</Section>)}
          </div>
        </div>
      </Stateful>
    </>
  );
};

const GruposList = ({ go }) => {
  const { role, T } = useOrb();
  const [view, setView] = React.useState('lista');
  const list = role === 'lider' ? GROUPS.filter(g => g.net === 'Rede Sul') : GROUPS;
  return (
    <>
      <PageHeader over="Comunidade" title={T.p} o="existe" sub={role === 'lider' ? `Você vê só ${T.g}s ${T.pl} que supervisiona.` : `${GROUPS.length} ${T.pl} · 74 participantes · 3 redes`}
        actions={<><Seg value={view} onChange={setView} options={[['lista', 'Lista'], ['mapa', 'Mapa']]} />{role !== 'lider' && <button className="btn primary"><Ic n="plus" s={15} />Nov{T.g} {T.sl}</button>}</>} />
      <Stateful empty={{ icon: 'heart', title: `Nenhum${T.g === 'a' ? 'a' : ''} ${T.sl} ainda`, text: `Crie ${T.g === 'a' ? 'a primeira' : 'o primeiro'} ${T.sl} e defina o líder, o dia e o local.` }}>
        {view === 'mapa' ? (
          <div className="card stripe" style={{ height: 460, position: 'relative', display: 'flex', alignItems: 'flex-end', padding: 14 }}>
            <span className="label" style={{ position: 'absolute', top: 14, left: 14 }}>Mapa das {T.pl} · API pronta <O o="api" /></span>
            {list.map((g, i) => <div key={g.id} style={{ position: 'absolute', left: `${15 + (i * 13) % 70}%`, top: `${20 + (i * 23) % 60}%` }}><span className={`dot ${g.health === 'amber' ? 'amber' : g.health === 'red' ? 'red' : 'green'}`} style={{ width: 14, height: 14, border: '2px solid var(--surface)', boxShadow: 'var(--shadow-md)' }} /></div>)}
          </div>
        ) : (
          <div className="card" style={{ overflow: 'hidden' }}>
            <table className="tbl">
              <thead><tr><th>{T.s}</th><th>Tipo</th><th>Rede</th><th>Líder</th><th>Encontro</th><th>Membros</th><th>Presença</th><th>Saúde <PBadge /></th></tr></thead>
              <tbody>{list.map(g => (
                <tr key={g.id} className="click" onClick={() => go('grupo:' + g.id)}>
                  <td style={{ fontWeight: 500 }}>{g.name}</td><td className="stone">{g.type}</td><td className="stone">{g.net}</td><td className="stone">{g.leader}</td><td className="stone">{g.day}</td><td className="num">{g.members}</td>
                  <td style={{ width: 130 }}><div className="row" style={{ gap: 8 }}><div className="bar grow"><i style={{ width: g.att + '%' }} /></div><span className="num cap">{g.att}%</span></div></td>
                  <td><Health h={g.health} /></td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </Stateful>
    </>
  );
};

const GrupoPage = ({ id, go }) => {
  const { T, plan } = useOrb();
  const g = GROUPS.find(x => x.id === +id) || GROUPS[0];
  const [tab, setTab] = React.useState('geral');
  const members = PEOPLE.filter(p => p.group === 'Vila Mariana').concat(PEOPLE.slice(4, 7));
  const tabs = [['geral', 'Visão geral', 'existe'], ['membros', 'Membros'], ['encontros', 'Encontros'], ['materiais', 'Materiais', 'api'], ['oracao', 'Oração'], ['chat', 'Chat'], ['visitas', 'Pedidos de visita'], ['ausencias', 'Ausências'], ['arvore', 'Árvore']];
  const content = {
    geral: (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 16 }}>
        <div className="col" style={{ gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 14 }}>
            <KPI label="Presença · 4 sem." value={g.att + '%'} delta="+6 p.p." /><KPI label="Visitantes · mês" value={g.visitors} /><KPI label="Oferta · mês" value="412" prefix="R$" />
          </div>
          <Section title="Últimos encontros" pad={0}>
            {[['Qua 13/05', 'Estudo 11 · Enoque e Noé', '10/12', '+1'], ['Qua 06/05', 'Estudo 10 · Abel', '9/12', '+2'], ['Qua 29/04', 'Estudo 9 · O que é fé', '11/12', '0']].map((r, i) => <div key={i} className="row" style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', gap: 14 }}><span className="mono cap" style={{ width: 70 }}>{r[0]}</span><span className="grow">{r[1]}</span><span className="num">{r[2]}</span><span className="badge teal">{r[3]} visit.</span></div>)}
          </Section>
        </div>
        <div className="col" style={{ gap: 16 }}>
          <Section title="Dados">
            <div className="col" style={{ gap: 12 }}>
              <div className="stripe" style={{ height: 110, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="label">foto d{T.g} {T.sl}</span></div>
              {[['user', 'Líder', g.leader], ['clock', 'Encontro', g.day], ['pin', 'Local', g.address], ['users', 'Público-alvo', g.type], ['branch', 'Rede', g.net]].map(([i, l, v]) => <div key={l} className="row" style={{ gap: 10 }}><Ic n={i} s={15} className="muted" /><span className="cap" style={{ width: 80 }}>{l}</span><span className="grow">{v}</span></div>)}
            </div>
          </Section>
          <Section title="Saúde" right={<PBadge />}>{plan === 'premium' ? <div className="col" style={{ gap: 10 }}><Health h={g.health} />{[['Frequência', g.att], ['Visitantes', 60], ['Ofertas', 72], ['Regularidade do relatório', 90]].map(([l, v]) => <div key={l}><div className="row cap" style={{ justifyContent: 'space-between' }}><span>{l}</span><span className="num">{v}</span></div><div className="bar" style={{ marginTop: 4 }}><i style={{ width: v + '%' }} /></div></div>)}</div> : <PremiumInvite what="Semáforo de saúde" />}</Section>
        </div>
      </div>
    ),
    membros: <div className="card" style={{ overflow: 'hidden' }}><table className="tbl"><thead><tr><th>Nome</th><th>Função</th><th>Vínculo</th><th>Presença · 8 sem.</th><th></th></tr></thead><tbody>{members.map(p => <tr key={p.id}><td><div className="row" style={{ gap: 10 }}><Av name={p.name} s={28} tone={p.bond === 'Visitante' ? 'teal' : ''} /><b style={{ fontWeight: 500 }}>{p.name}</b></div></td><td className="stone">{p.role || 'Participante'}</td><td><span className={`badge ${BOND_TONE[p.bond]}`}>{p.bond}</span></td><td><div className="row" style={{ gap: 3 }}>{Array.from({ length: 8 }).map((_, i) => <span key={i} style={{ width: 10, height: 10, borderRadius: 3, background: (p.id + i) % 5 === 0 ? 'var(--subtle)' : 'var(--teal)' }} />)}</div></td><td><button className="btn ghost sm" onClick={() => go('pessoa:' + p.id)}>Ficha</button></td></tr>)}</tbody></table></div>,
    encontros: (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 16 }}>
        <Section title="Encontro de hoje · Qua 14/05" right={<span className="badge amber">Presença pendente</span>}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[['Tema', 'Estudo 12 · A fé de Abraão'], ['Visitantes', '2'], ['Oferta arrecadada', 'R$ 0,00'], ['Observações pastorais', 'Orar pela Renata (cirurgia)']].map(([l, v]) => <div key={l}><div className="label" style={{ marginBottom: 4 }}>{l}</div><div className="input"><input defaultValue={v} /></div></div>)}
          </div>
          <div className="row" style={{ gap: 8, marginTop: 16 }}><button className="btn primary">Registrar presença</button><button className="btn secondary">Salvar rascunho</button></div>
        </Section>
        <Section title="QR de check-in" o="existe">
          <div className="row" style={{ gap: 16 }}>
            <div style={{ width: 120, height: 120, borderRadius: 8, background: 'var(--fg)', padding: 10 }}><div className="stripe" style={{ width: '100%', height: '100%', background: 'var(--surface)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic n="qr" s={42} /></div></div>
            <div className="col" style={{ gap: 6 }}><div style={{ fontWeight: 500 }}>Válido até 00h12</div><div className="cap">Vale 4 horas. Pode ser gerado até 24h depois do encontro.</div><div className="row" style={{ gap: 6, marginTop: 6 }}><button className="btn secondary sm"><Ic n="refresh" s={13} />Renovar</button><button className="btn ghost sm">Projetar</button></div></div>
          </div>
        </Section>
      </div>
    ),
    materiais: <div className="card" style={{ overflow: 'hidden' }}><table className="tbl"><thead><tr><th>Material</th><th>Disponível</th><th>Expira</th><th>Abriram</th></tr></thead><tbody>{MATERIALS.filter(m => m.target.includes('Todas')).map(m => <tr key={m.id}><td style={{ fontWeight: 500 }}>{m.title}</td><td className="num stone">{m.from}</td><td className="num stone">{m.until}</td><td><span className="num">{Math.round(m.open * .12)}</span><span className="cap"> / 12 membros</span></td></tr>)}</tbody></table><div className="row" style={{ padding: 14, borderTop: '1px solid var(--border)' }}><button className="btn ghost sm" onClick={() => go('materiais')}>Abrir biblioteca de materiais<Ic n="arrow-right" s={13} /></button></div></div>,
    oracao: <div className="col" style={{ gap: 10, maxWidth: 720 }}>{[['Júlia Mendes', 'Pelo emprego novo do meu marido.', false, '2 dias'], ['Renata Alves', 'Cirurgia na sexta. Paz e recuperação.', true, '4 dias'], ['Pedro Lima', 'Gratidão pela formatura do Lucas!', false, '1 sem.']].map(([n, t, priv, w]) => <div key={n} className="card row" style={{ padding: 14, gap: 12, alignItems: 'flex-start' }}><Av name={n} s={30} /><div className="grow"><div className="row" style={{ gap: 8 }}><b style={{ fontWeight: 500 }}>{n}</b>{priv && <span className="badge"><Ic n="lock" s={10} />Só liderança</span>}<span className="cap">· há {w}</span></div><p style={{ marginTop: 3 }}>{t}</p></div><button className="btn ghost sm" title="Moderar"><Ic n="trash" s={14} /></button></div>)}</div>,
    chat: <div className="card" style={{ maxWidth: 720, padding: 16 }}>{[['Carla Souza', 'Gente, o estudo de hoje já está no app. Leiam o cap. 11 antes.', '18h02'], ['Pedro Lima', 'Levo o lanche!', '18h10'], ['Júlia Mendes', 'Posso levar uma amiga hoje?', '18h31']].map(([n, t, h]) => <div key={h} className="row" style={{ gap: 10, alignItems: 'flex-start', padding: '8px 0' }}><Av name={n} s={28} /><div className="grow"><div className="row" style={{ gap: 6 }}><b style={{ fontWeight: 500, fontSize: 13 }}>{n}</b><span className="cap mono">{h}</span></div><div>{t}</div></div><button className="btn ghost sm"><Ic n="more" s={14} /></button></div>)}<div className="cap" style={{ marginTop: 8 }}>Chat fechado d{T.g} {T.sl}. Líder e pastor podem moderar.</div></div>,
    visitas: <div className="col" style={{ gap: 10, maxWidth: 720 }}>{[['Bianca Torres', '(11) 98111-2020', 'Quer visitar na quarta', 'Hoje'], ['Rafael Nogueira', '(11) 97000-4141', 'Mudou para o bairro', 'Ontem']].map(([n, t, m, w]) => <div key={n} className="card row" style={{ padding: 14, gap: 12 }}><Av name={n} s={34} tone="teal" /><div className="grow"><b style={{ fontWeight: 500 }}>{n}</b><div className="cap">{t} · "{m}" · {w}</div></div><button className="btn secondary sm"><Ic n="msg" s={13} />WhatsApp</button><button className="btn primary sm">Marcar como respondido</button></div>)}</div>,
    ausencias: <div className="col" style={{ gap: 10, maxWidth: 720 }}>{[['Maria Vieira', 3], ['Tiago Mendes', 2]].map(([n, w]) => <div key={n} className="card row" style={{ padding: 14, gap: 12 }}><Av name={n} s={34} tone="gray" /><div className="grow"><b style={{ fontWeight: 500 }}>{n}</b><div className="cap">Não vem há {w} semanas</div></div><button className="btn secondary sm"><Ic n="phone" s={13} />Ligar</button><button className="btn secondary sm"><Ic n="msg" s={13} />WhatsApp</button></div>)}</div>,
    arvore: <div className="card" style={{ padding: 24 }}><div className="col" style={{ alignItems: 'center', gap: 18 }}><span className="badge solid">{T.s} Mãe · 2017</span><div style={{ width: 1, height: 18, background: 'var(--border-strong)' }} /><span className="badge brand">{g.name} · 2021</span><div style={{ width: 240, height: 18, borderTop: '1px solid var(--border-strong)', borderLeft: '1px solid var(--border-strong)', borderRight: '1px solid var(--border-strong)' }} /><div className="row" style={{ gap: 120 }}><span className="badge">Moema Casais · 2023</span><span className="badge" style={{ borderStyle: 'dashed', border: '1px dashed var(--border-strong)', background: 'transparent' }}>Próxima multiplicação · meta 2026</span></div></div></div>,
  };
  return (
    <>
      <PageHeader over={`${T.s} · ${g.net}`} o="proposta" title={g.name} sub={`${g.day} · líder ${g.leader} · ${g.members} membros`} tab={tab} setTab={setTab} tabs={tabs}
        actions={<><span className="row cap" style={{ gap: 6 }}><Ic n="link" s={13} />/grupos/{g.id}</span><button className="btn secondary"><Ic n="qr" s={15} />QR de check-in</button><button className="btn primary"><Ic n="plus" s={15} />Registrar encontro</button></>} />
      <Stateful>{content[tab]}</Stateful>
    </>
  );
};

const MateriaisPage = () => {
  const { T } = useOrb();
  const [sel, setSel] = React.useState(1);
  const m = MATERIALS.find(x => x.id === sel);
  return (
    <>
      <PageHeader over="Comunidade" title="Materiais" o="api" sub={`Biblioteca de estudos d${T.g}s ${T.pl}. O material aparece na data agendada e some na expiração.`}
        actions={<><button className="btn secondary"><Ic n="upload" s={15} />Enviar PDF/DOC</button><button className="btn primary"><Ic n="edit" s={15} />Escrever material</button></>} />
      <Stateful empty={{ icon: 'book', title: 'A biblioteca está vazia', text: `Envie um PDF ou escreva o primeiro estudo. Você escolhe para quais ${T.pl} ele vai e quando aparece.` }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="row" style={{ padding: 12, gap: 8, borderBottom: '1px solid var(--border)' }}><div className="input grow" style={{ height: 32 }}><Ic n="search" s={14} className="muted" /><input placeholder="Buscar por título ou tag" /></div><Seg value="todos" onChange={() => { }} options={[['todos', 'Todos'], ['ag', 'Agendados'], ['den', 'Da denominação']]} /></div>
            <table className="tbl"><thead><tr><th>Material</th><th>Grupo-alvo</th><th>Janela</th><th>Abertura</th></tr></thead>
              <tbody>{MATERIALS.map(x => <tr key={x.id} className="click" onClick={() => setSel(x.id)} style={{ background: sel === x.id ? 'var(--subtle)' : '' }}>
                <td><div style={{ fontWeight: 500 }}>{x.title}</div><div className="row cap" style={{ gap: 6, marginTop: 2 }}><span>{x.kind}</span>·<span>v{x.ver}</span>{x.origin === 'Denominação' && <span className="badge brand" style={{ height: 18 }}>Denominação</span>}</div></td>
                <td className="stone">{x.target}</td><td className="num stone" style={{ fontSize: 12 }}>{x.from} → {x.until}</td>
                <td style={{ width: 110 }}><div className="row" style={{ gap: 6 }}><div className="bar grow"><i style={{ width: x.open + '%' }} /></div><span className="num cap">{x.open}%</span></div></td></tr>)}</tbody></table>
          </div>
          <Section title={m.title} right={<button className="btn ghost sm"><Ic n="edit" s={13} />Editar</button>}>
            <div className="col" style={{ gap: 16 }}>
              <div><div className="label" style={{ marginBottom: 6 }}>Grupo-alvo</div><Seg value="todos" onChange={() => { }} options={[['todos', `Todas`], ['tipos', 'Alguns tipos'], ['sel', 'Selecionadas']]} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><div><div className="label" style={{ marginBottom: 4 }}>Disponível em</div><div className="input"><Ic n="calendar" s={14} className="muted" /><input defaultValue={m.from + '/2026 · 08h'} /></div></div><div><div className="label" style={{ marginBottom: 4 }}>Expira em</div><div className="input"><Ic n="calendar" s={14} className="muted" /><input defaultValue={m.until === '—' ? '' : m.until + '/2026'} placeholder="Sem expiração" /></div></div></div>
              <div><div className="label" style={{ marginBottom: 6 }}>Tags</div><div className="row" style={{ gap: 6 }}>{m.tags.map(t => <span key={t} className="badge">{t}</span>)}<button className="btn ghost sm"><Ic n="plus" s={12} /></button></div></div>
              <div><div className="label" style={{ marginBottom: 8 }}>Abertura por {T.sl}</div>{GROUPS.slice(0, 5).map((g, i) => { const v = [92, 78, 40, 10, 85][i]; return <div key={g.id} className="row" style={{ gap: 10, padding: '4px 0' }}><span className="grow trunc">{g.name}</span><div className="bar" style={{ width: 90 }}><i style={{ width: v + '%', background: v < 30 ? 'var(--amber)' : 'var(--teal)' }} /></div><span className="num cap" style={{ width: 32, textAlign: 'right' }}>{v}%</span></div>; })}</div>
              <div><div className="label" style={{ marginBottom: 6 }}>Versões</div>{Array.from({ length: m.ver }).map((_, i) => <div key={i} className="row cap" style={{ gap: 8, padding: '3px 0' }}><span className="mono">v{m.ver - i}</span><span className="grow">{i === 0 ? 'Atual' : 'Correção de referência'}</span><span>Pr. Daniel · {12 - i * 2}/05</span></div>)}</div>
              <div className="row cap" style={{ gap: 6 }}>Banco de estudos da denominação replicado nas congregações <O o="promessa" /></div>
            </div>
          </Section>
        </div>
      </Stateful>
    </>
  );
};

Object.assign(window, { PessoasList, PessoaPage, GruposList, GrupoPage, MateriaisPage });
