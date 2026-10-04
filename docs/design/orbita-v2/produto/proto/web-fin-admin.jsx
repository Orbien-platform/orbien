// Web — Financeiro, Administração
const FinGate = ({ what, children }) => {
  const { plan } = useOrb();
  if (plan === 'premium') return children;
  return <div className="col" style={{ gap: 16 }}><PremiumInvite what={what} /><div style={{ opacity: .35, pointerEvents: 'none', filter: 'grayscale(.6)' }}>{children}</div></div>;
};

const FinGeral = () => {
  const { role, plan } = useOrb();
  const cur = [3200, 5400, 6100, 4800, 4680], prev = [2900, 4800, 5200, 4500, 4100], max = 6500;
  return (
    <>
      <PageHeader over="Financeiro" title="Visão geral" o="existe" sub={role === 'pastor' ? 'Você vê totais. Nomes de contribuintes ficam com a tesouraria.' : 'Maio de 2026 · Congregação Vila Mariana'} actions={<Seg value="mes" onChange={() => { }} options={[['sem', 'Semana'], ['mes', 'Mês'], ['ano', 'Ano']]} />} />
      <Stateful>
        <div className="col" style={{ gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 14 }}>
            <KPI label="Receitas · mês" value="24.180" prefix="R$" delta="+12,4%" sub="vs. abril" o="existe" />
            <KPI label="Despesas · mês" value="17.768" prefix="R$" delta="+3,1%" up={false} sub="vs. abril" o="existe" />
            <KPI label="Dizimistas ativos" value="47%" sub="87 de 187" o="promessa" />
            <KPI label="Ticket médio" value="278" prefix="R$" o="promessa" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 16 }}>
            <Section title="Receitas por semana" o="existe" right={<span className="row cap" style={{ gap: 12 }}><span className="row" style={{ gap: 5 }}><span className="dot" style={{ background: 'var(--brand)' }} />Maio</span><span className="row" style={{ gap: 5 }}><span className="dot" style={{ background: 'var(--border-strong)' }} />Abril</span></span>}>
              <div className="row" style={{ alignItems: 'flex-end', gap: 28, height: 180, padding: '0 8px' }}>{cur.map((v, i) => <div key={i} className="col grow" style={{ alignItems: 'center', gap: 8 }}><div className="row" style={{ alignItems: 'flex-end', gap: 5, height: 150 }}><div style={{ width: 16, height: prev[i] / max * 150, background: 'var(--subtle)', borderRadius: 3 }} /><div style={{ width: 16, height: v / max * 150, background: 'var(--brand)', borderRadius: 3 }} /></div><span className="label">S{i + 1}</span></div>)}</div>
            </Section>
            <Section title="Forecast" right={<PBadge />}>
              {plan === 'premium' ? <div className="col" style={{ gap: 14 }}>{[['3 meses', '78.400', 70], ['6 meses', '151.900', 82], ['12 meses', '298.300', 64]].map(([l, v, c]) => <div key={l}><div className="row" style={{ justifyContent: 'space-between' }}><span className="cap">{l}</span><span className="num" style={{ fontWeight: 500 }}>R$ {v}</span></div><div className="cap">confiança {c}%</div></div>)}<div className="hr" /><div className="row" style={{ justifyContent: 'space-between' }}><span className="cap">Caixa projetado · 90 dias</span><span className="num" style={{ fontWeight: 500 }}>R$ 41.200</span></div></div> : <PremiumInvite what="Forecast de 3, 6 e 12 meses" />}
            </Section>
          </div>
          <Section title="Por categoria · mês" pad={0}>
            <table className="tbl"><thead><tr><th>Categoria</th><th>Maio</th><th>Abril</th><th>Variação</th></tr></thead><tbody>{[['Dízimo', 15420, 14010], ['Oferta', 4370, 3980], ['Missões', 1150, 1300], ['Eventos', 3240, 1220]].map(([c, a, b]) => { const d = ((a - b) / b * 100).toFixed(1); return <tr key={c}><td style={{ fontWeight: 500 }}>{c}</td><td className="num">{brl(a)}</td><td className="num stone">{brl(b)}</td><td className="num" style={{ color: d >= 0 ? 'var(--teal-ink)' : 'var(--crimson-ink)' }}>{d >= 0 ? '+' : ''}{d.replace('.', ',')}%</td></tr>; })}</tbody></table>
          </Section>
        </div>
      </Stateful>
    </>
  );
};

const FinLanc = () => {
  const [t, setT] = React.useState('todos');
  const list = ENTRIES.filter(e => t === 'todos' || (t === 'rec' ? e.v > 0 : e.v < 0));
  return (
    <>
      <PageHeader over="Financeiro" title="Lançamentos" o="existe" sub="Receitas e despesas, com comprovante, parcelamento e lançamento fixo mensal."
        actions={<><button className="btn secondary"><Ic n="refresh" s={15} />Recorrentes</button><button className="btn primary"><Ic n="plus" s={15} />Novo lançamento</button></>} />
      <div className="row" style={{ gap: 10, marginBottom: 12 }}><Seg value={t} onChange={setT} options={[['todos', 'Todos'], ['rec', 'Receitas'], ['desp', 'Despesas']]} /><button className="btn secondary sm">Status<Ic n="chev-d" s={13} /></button><button className="btn secondary sm">Centro de custo<Ic n="chev-d" s={13} /></button><div className="grow" /><span className="cap">Maio/2026 · 7 lançamentos</span></div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <Stateful compact empty={{ icon: 'list', title: 'Nenhum lançamento no período', text: 'Lance a primeira receita ou despesa, ou importe um extrato OFX na Conciliação.' }}>
          <table className="tbl"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Centro de custo</th><th>Status</th><th style={{ textAlign: 'right' }}>Valor</th><th></th></tr></thead>
            <tbody>{list.map((e, i) => <tr key={i}><td className="num stone" style={{ fontSize: 12.5 }}>{e.d}</td><td style={{ fontWeight: 500 }}>{e.desc}</td><td className="stone">{e.cat}</td><td className="stone">{e.cc}</td><td><span className={`badge ${e.st === 'Pendente' ? 'amber' : e.st === 'Conciliado' ? 'teal' : ''}`}>{e.st}</span></td><td className="num" style={{ textAlign: 'right', color: e.v > 0 ? 'var(--teal-ink)' : 'var(--fg)' }}>{e.v > 0 ? '+' : '−'} {brl(Math.abs(e.v))}</td><td><Ic n="file" s={14} className="muted" /></td></tr>)}</tbody></table>
        </Stateful>
      </div>
      <p className="cap" style={{ marginTop: 10 }}>Cada lançamento guarda quem criou e quem editou.</p>
    </>
  );
};

const FinDoacoes = () => {
  const { plan } = useOrb();
  const [tab, setTab] = React.useState('pix');
  const content = {
    pix: <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16 }}>
      <Section title="Chave PIX da igreja" o="existe" right={<span className="badge">Starter e Premium</span>}><div className="row" style={{ gap: 10 }}><div className="input grow"><Ic n="pix" s={15} className="muted" /><input defaultValue="financeiro@vidanova.org.br" /></div><button className="btn secondary">Salvar</button></div><p className="cap" style={{ marginTop: 10 }}>Aparece no app e em /doar/vidanova com copia-e-cola.</p></Section>
      <Section title="QR dinâmico identificado" o="existe" right={<PBadge />}>{plan === 'premium' ? <div className="row" style={{ gap: 10 }}><span className="dot green" /><span className="grow">Ativo · confirmação automática</span><button className="btn ghost sm">Configurar</button></div> : <PremiumInvite what="QR dinâmico com confirmação automática" />}</Section>
    </div>,
    rec: <FinGate what="Dízimo recorrente (PIX Automático)"><div className="card" style={{ overflow: 'hidden' }}><table className="tbl"><thead><tr><th>Doador</th><th>Valor</th><th>Dia</th><th>Status</th><th></th></tr></thead><tbody>{[['Júlia Mendes', 450, 5, 'Ativa'], ['Pedro Lima', 800, 10, 'Falhou'], ['Renata Alves', 300, 5, 'Ativa'], ['Felipe Oliveira', 250, 15, 'Falhou'], ['Carla Souza', 600, 1, 'Pausada']].map(([n, v, d, s]) => <tr key={n}><td style={{ fontWeight: 500 }}>{n}</td><td className="num">{brl(v)}</td><td className="num">dia {d}</td><td><span className={`badge ${s === 'Falhou' ? 'crimson' : s === 'Ativa' ? 'teal' : ''}`}>{s}</span></td><td>{s === 'Falhou' ? <button className="btn secondary sm">Ver falha</button> : <button className="btn ghost sm">Cancelar</button>}</td></tr>)}</tbody></table></div></FinGate>,
    pub: <div className="col" style={{ gap: 12 }}><div className="row cap" style={{ gap: 6 }}>Intenções registradas em /doar/vidanova. Hoje a tesouraria não vê essas doações. <O o="promessa" /></div><div className="card" style={{ overflow: 'hidden' }}><table className="tbl"><thead><tr><th>Quando</th><th>Doador</th><th>Categoria</th><th>Valor</th><th>Situação</th><th></th></tr></thead><tbody>{[['14/05 · 10h41', 'Anônimo', 'Oferta', 50], ['14/05 · 10h22', 'Marcos P.', 'Missões', 120], ['13/05 · 21h07', 'Anônimo', 'Dízimo', 300], ['12/05 · 09h55', 'Lúcia F.', 'Oferta', 80], ['11/05 · 19h30', 'Anônimo', 'Oferta', 20]].map((r, i) => <tr key={i}><td className="num stone" style={{ fontSize: 12.5 }}>{r[0]}</td><td>{r[1]}</td><td className="stone">{r[2]}</td><td className="num">{brl(r[3])}</td><td><span className="badge amber">A confirmar</span></td><td><button className="btn secondary sm">Casar com extrato</button></td></tr>)}</tbody></table></div></div>,
    recibos: <FinGate what="Recibos em PDF"><div className="card" style={{ overflow: 'hidden' }}><table className="tbl"><thead><tr><th>Nº</th><th>Doador</th><th>Data</th><th>Valor</th><th></th></tr></thead><tbody>{[['2026-0412', 'Júlia Mendes', '05/05', 450], ['2026-0411', 'Renata Alves', '05/05', 300], ['2026-0410', 'Pedro Lima', '30/04', 800]].map(r => <tr key={r[0]}><td className="mono">{r[0]}</td><td>{r[1]}</td><td className="num stone">{r[2]}</td><td className="num">{brl(r[3])}</td><td><button className="btn ghost sm"><Ic n="download" s={13} />PDF</button></td></tr>)}</tbody></table></div></FinGate>,
  };
  return (<><PageHeader over="Financeiro" title="Doações" sub="PIX, dízimo recorrente e recibos. Premium, exceto a chave PIX." tab={tab} setTab={setTab} tabs={[['pix', 'PIX', 'existe'], ['rec', 'Dízimo recorrente', 'existe'], ['pub', 'Página pública', 'promessa'], ['recibos', 'Recibos', 'existe']]} /><Stateful>{content[tab]}</Stateful></>);
};

const FinRel = () => {
  const { role } = useOrb();
  const [r, setR] = React.useState('dre');
  const reps = [['dre', 'DRE', 'existe'], ['fluxo', 'Fluxo de caixa', 'existe'], ['bal', 'Balancete por centro de custo', 'existe'], ['carne', 'Carnê do dizimista', 'existe'], ['cat', 'Receita por categoria · mês a mês', 'promessa'], ['top', 'Top contribuintes (anônimo)', 'promessa']];
  return (
    <>
      <PageHeader over="Financeiro" title="Relatórios" sub="Ler e exportar. Operação diária fica em Lançamentos." actions={<><button className="btn secondary"><Ic n="calendar" s={15} />Jan – Mai 2026</button><button className="btn primary"><Ic n="download" s={15} />Exportar PDF</button></>} />
      <FinGate what="DRE, fluxo de caixa, balancete e carnê do dizimista">
        <Stateful>
          <div style={{ display: 'grid', gridTemplateColumns: '240px minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
            <div className="card col" style={{ padding: 6 }}>{reps.filter(x => role !== 'pastor' || !['carne', 'top'].includes(x[0])).map(([k, l, o]) => <button key={k} onClick={() => setR(k)} className="row" style={{ minHeight: 36, padding: '6px 10px', borderRadius: 7, gap: 6, textAlign: 'left', background: r === k ? 'var(--subtle)' : 'transparent', fontWeight: r === k ? 500 : 400 }}><span className="grow">{l}</span><O o={o} /></button>)}</div>
            <Section title={reps.find(x => x[0] === r)[1]} pad={0}>
              <table className="tbl"><tbody>
                {[['Receitas operacionais', 112840, 1], ['  Dízimos', 74210], ['  Ofertas', 21430], ['  Missões', 6200], ['  Eventos', 11000], ['Despesas operacionais', -84410, 1], ['  Pessoal', -32000], ['  Templo e utilidades', -28760], ['  Ministérios', -12650], ['  Missões repassadas', -11000], ['Resultado do período', 28430, 1]].map(([l, v, b], i) => <tr key={i}><td style={{ fontWeight: b ? 500 : 400, paddingLeft: l.startsWith('  ') ? 32 : 14, color: b ? 'var(--fg)' : 'var(--stone)' }}>{l.trim()}</td><td className="num" style={{ textAlign: 'right', fontWeight: b ? 500 : 400 }}>{brl(v)}</td></tr>)}
              </tbody></table>
            </Section>
          </div>
        </Stateful>
      </FinGate>
    </>
  );
};

const FinConc = () => (
  <>
    <PageHeader over="Financeiro" title="Conciliação" o="existe" sub="Importe o extrato OFX e case com os lançamentos." actions={<button className="btn primary"><Ic n="upload" s={15} />Importar OFX</button>} />
    <FinGate what="Conciliação bancária por OFX">
      <Stateful empty={{ icon: 'bank', title: 'Nenhum extrato importado', text: 'Baixe o OFX no internet banking e importe aqui.' }}>
        <div className="row cap" style={{ gap: 14, marginBottom: 12 }}><span>Extrato Itaú · 01/05 – 13/05</span><span className="badge teal">31 conciliadas</span><span className="badge amber">14 pendentes</span></div>
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="tbl"><thead><tr><th>Extrato</th><th style={{ textAlign: 'right' }}>Valor</th><th></th><th>Lançamento sugerido</th><th></th></tr></thead>
            <tbody>{[['13/05 PIX RECEBIDO JULIA M', 450, 'Dízimo recorrente · Júlia Mendes', true], ['13/05 PAG CONTA ENEL', -1284.5, 'Energia elétrica · maio', true], ['12/05 PIX RECEBIDO', 120, 'Intenção de doação · Marcos P.', true], ['11/05 TED 341 0012', -2100, null, false]].map((r, i) => <tr key={i}><td className="mono" style={{ fontSize: 12 }}>{r[0]}</td><td className="num" style={{ textAlign: 'right' }}>{brl(r[1])}</td><td><Ic n="arrow-right" s={14} className="muted" /></td><td>{r[2] ? <span>{r[2]}</span> : <span className="muted">Sem correspondência</span>}</td><td>{r[3] ? <button className="btn primary sm"><Ic n="check" s={13} />Casar</button> : <button className="btn secondary sm"><Ic n="plus" s={13} />Criar lançamento</button>}</td></tr>)}</tbody></table>
        </div>
      </Stateful>
    </FinGate>
  </>
);

const FinExp = () => (
  <>
    <PageHeader over="Financeiro" title="Exportação" o="existe" sub="Arquivos para a contabilidade." />
    <FinGate what="Exportação OFX, SPED, CSV e PDF">
      <Stateful>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 14, marginBottom: 16 }}>{[['OFX', 'Movimentação bancária'], ['SPED', 'Gerado em segundo plano'], ['CSV', 'Planilha de lançamentos'], ['PDF', 'Relatórios formatados']].map(([f, d]) => <button key={f} className="card" style={{ padding: 18, textAlign: 'left' }}><div className="mono" style={{ fontSize: 18, fontWeight: 500 }}>{f}</div><div className="cap" style={{ marginTop: 4 }}>{d}</div></button>)}</div>
        <Section title="Pacote para a contabilidade"><div className="row" style={{ gap: 12, flexWrap: 'wrap' }}><div className="input" style={{ width: 220 }}><Ic n="calendar" s={14} className="muted" /><input defaultValue="Abril/2026" /></div><label className="row" style={{ gap: 8 }}><Tog on={true} />ZIP com comprovantes</label><div className="grow" /><button className="btn primary"><Ic n="download" s={15} />Gerar pacote</button></div>
          <div className="hr" style={{ margin: '16px 0' }} /><div className="row cap" style={{ gap: 10 }}><span className="dot amber" />SPED de março · processando · você recebe um aviso quando estiver pronto</div></Section>
      </Stateful>
    </FinGate>
  </>
);

const FinCad = () => {
  const [tab, setTab] = React.useState('cat');
  const data = { plano: [['1', 'Receitas'], ['1.1', 'Dízimos'], ['1.2', 'Ofertas'], ['2', 'Despesas'], ['2.1', 'Pessoal'], ['2.2', 'Templo']], cat: [['Dízimo', 'Receita', 312], ['Oferta', 'Receita', 208], ['Missões', 'Receita', 41], ['Aluguel', 'Despesa', 5], ['Utilidades', 'Despesa', 14]], cc: [['Geral', 'Ativo'], ['Templo', 'Ativo'], ['Jovens', 'Ativo'], ['Infantil', 'Ativo'], ['Missões', 'Ativo']] };
  return (
    <>
      <PageHeader over="Financeiro" title="Cadastros" o="existe" sub="Antes ficavam em modais. Agora têm lugar próprio." tab={tab} setTab={setTab} tabs={[['plano', 'Plano de contas'], ['cat', 'Categorias'], ['cc', 'Centros de custo']]} actions={<button className="btn primary"><Ic n="plus" s={15} />Novo</button>} />
      <Stateful><div className="card" style={{ overflow: 'hidden', maxWidth: 760 }}><table className="tbl"><tbody>{data[tab].map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j ? 'stone' : ''} style={{ fontWeight: j ? 400 : 500 }}>{typeof c === 'number' ? c + ' lançamentos' : c}</td>)}<td style={{ width: 40 }}><Ic n="edit" s={14} className="muted" /></td></tr>)}</tbody></table></div></Stateful>
    </>
  );
};

// ── Administração
const AdmIgreja = () => {
  const { T } = useOrb();
  return (
    <>
      <PageHeader over="Administração" title="Igreja e congregações" o="existe" actions={<button className="btn primary">Salvar</button>} />
      <Stateful>
        <div className="col" style={{ gap: 16, maxWidth: 860 }}>
          <Section title="Congregação"><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>{[['Nome', 'Vila Mariana'], ['Fuso horário', 'America/Sao_Paulo (UTC−3)'], ['Endereço', 'R. Domingos de Morais, 1200'], ['Organização', 'Igreja Vida Nova · 3 congregações']].map(([l, v]) => <div key={l}><div className="label" style={{ marginBottom: 4 }}>{l}</div><div className="input"><input defaultValue={v} /></div></div>)}</div></Section>
          <Section title="Terminologia" o="promessa"><p className="stone" style={{ marginBottom: 12 }}>Como a igreja chama os grupos. O termo aparece no menu, no app e nas notificações.</p><div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>{['Célula', 'PG', 'GC', 'EBD', 'Discipulado'].map(t => <span key={t} className={`badge ${T.s === t ? 'solid' : ''}`} style={{ height: 30, padding: '0 14px', fontSize: 12.5 }}>{t}</span>)}</div><p className="cap" style={{ marginTop: 10 }}>Use o painel de Tweaks para ver o protótipo com outro termo.</p></Section>
          <Section title="Congregações" pad={0}>{[['Vila Mariana', 'Sede · 187 pessoas'], ['Ipiranga', '96 pessoas'], ['Santo André', '54 pessoas']].map(([n, d]) => <div key={n} className="row" style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', gap: 10 }}><Ic n="bank" s={15} className="muted" /><span className="grow" style={{ fontWeight: 500 }}>{n}</span><span className="cap">{d}</span></div>)}</Section>
        </div>
      </Stateful>
    </>
  );
};
const AdmUsuarios = () => (
  <>
    <PageHeader over="Administração" title="Usuários e papéis" o="api" sub="Antes ficava dentro da ficha da pessoa." actions={<button className="btn primary"><Ic n="send" s={15} />Convidar</button>} />
    <Stateful>
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="tbl"><thead><tr><th>Pessoa</th><th>Papéis</th><th>Último acesso</th><th>Situação</th><th></th></tr></thead>
          <tbody>{[['Pr. Daniel Alves', ['Pastor'], 'hoje', 'Ativo'], ['Marcos Teixeira', ['Admin'], 'hoje', 'Ativo'], ['Ricardo Nunes', ['Tesoureiro'], 'ontem', 'Ativo'], ['Sônia Ramos', ['Secretaria'], 'hoje', 'Ativo'], ['Roberto Lemos', ['Líder de ministério', 'Voluntário'], '2 dias', 'Ativo'], ['Carla Souza', ['Supervisora', 'Líder de célula'], 'hoje', 'Ativo'], ['Bruno Reis', ['Voluntário'], '—', 'Convite pendente'], ['Henrique Dias', ['Membro'], '3 meses', 'Desativado']].map(([n, r, a, s]) => <tr key={n}><td><div className="row" style={{ gap: 10 }}><Av name={n.replace('Pr. ', '')} s={28} /><b style={{ fontWeight: 500 }}>{n}</b></div></td><td><div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>{r.map(x => <span key={x} className="badge">{x}</span>)}</div></td><td className="stone">{a}</td><td><span className={`badge ${s === 'Ativo' ? 'teal' : s === 'Desativado' ? '' : 'amber'}`}>{s}</span></td><td><button className="btn ghost sm">Trocar papel</button></td></tr>)}</tbody></table>
      </div>
    </Stateful>
  </>
);
const AdmIdentidade = () => {
  const { brand } = useOrb();
  return (
    <>
      <PageHeader over="Administração" title="Identidade e domínio" o="existe" sub="Cor e logo valem para o app e para as páginas públicas." actions={<button className="btn primary">Salvar</button>} />
      <Stateful>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
          <div className="col" style={{ gap: 16 }}>
            <Section title="Cor e logo"><div className="row" style={{ gap: 16 }}><div className="stripe" style={{ width: 72, height: 72, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="label" style={{ fontSize: 8 }}>logo</span></div><div className="col" style={{ gap: 8 }}><div className="row" style={{ gap: 8 }}><span style={{ width: 28, height: 28, borderRadius: 8, background: brand }} /><span className="mono">{brand}</span></div><button className="btn secondary sm"><Ic n="upload" s={13} />Trocar logo</button></div></div><p className="cap" style={{ marginTop: 12 }}>Mude a cor no painel de Tweaks para ver o white-label no protótipo.</p></Section>
            <Section title="App próprio nas lojas" right={<PBadge />}><p className="stone">Nome, ícone e splash da igreja. No Starter, os membros usam o app Orbien com a sua cor e logo.</p></Section>
          </div>
          <Section title="Domínio próprio">
            <div className="col" style={{ gap: 12 }}>
              <div className="input"><Ic n="globe" s={15} className="muted" /><input defaultValue="app.vidanova.org.br" /></div>
              <Seg value="cf" onChange={() => { }} options={[['dns', 'Registro DNS manual'], ['cf', 'Conectar Cloudflare']]} />
              {[['app.vidanova.org.br', 'Verificado', 'teal'], ['doar.vidanova.org.br', 'Pendente', 'amber'], ['celulas.vidanova.org.br', 'Falhou', 'crimson']].map(([d, s, t]) => <div key={d} className="row" style={{ gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}><span className="mono grow" style={{ fontSize: 12.5 }}>{d}</span><span className={`badge ${t}`}>{s}</span></div>)}
              <div className="card" style={{ padding: 12, background: 'var(--subtle)', boxShadow: 'none' }}><div className="label" style={{ marginBottom: 4 }}>CNAME</div><div className="mono" style={{ fontSize: 12 }}>celulas → edge.orbien.app</div></div>
            </div>
          </Section>
        </div>
      </Stateful>
    </>
  );
};
const AdmPlano = () => {
  const { plan } = useOrb();
  const feats = ['App próprio nas lojas', 'QR PIX dinâmico e dízimo recorrente', 'Relatórios, conciliação e exportação', 'Semáforo de saúde dos grupos', 'Sugestão automática de escala', 'Forecast financeiro', 'Métricas de notificação e públicos avançados'];
  return (
    <>
      <PageHeader over="Administração" title="Plano e assinatura" o="promessa" />
      <Stateful>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr)', gap: 16, maxWidth: 1000 }}>
          <Section title="Plano atual"><div style={{ fontSize: 28, fontWeight: 500 }}>{plan === 'premium' ? 'Premium' : 'Starter'}</div><div className="cap">Renova em 01/06/2026 · 187 pessoas ativas</div><div className="row" style={{ gap: 8, marginTop: 16 }}><button className="btn secondary">Faturas</button><button className="btn secondary">Forma de pagamento</button></div></Section>
          <Section title={plan === 'premium' ? 'Incluído no seu plano' : 'O que o Premium libera'}>{feats.map(f => <div key={f} className="row" style={{ gap: 10, padding: '6px 0' }}><Ic n={plan === 'premium' ? 'check' : 'crown'} s={15} style={{ color: plan === 'premium' ? 'var(--teal-ink)' : 'var(--brand-ink)' }} />{f}</div>)}{plan !== 'premium' && <button className="btn primary" style={{ marginTop: 14 }}>Conhecer o Premium</button>}</Section>
        </div>
      </Stateful>
    </>
  );
};
const AdmLgpd = () => (
  <>
    <PageHeader over="Administração" title="Privacidade (LGPD)" o="api" />
    <Stateful>
      <div className="col" style={{ gap: 16 }}>
        <Section title="Pedidos de titulares" pad={0} o="api">
          <table className="tbl"><thead><tr><th>Titular</th><th>Pedido</th><th>Recebido</th><th>Prazo</th><th></th></tr></thead><tbody>{[['Henrique Dias', 'Exclusão da conta', '20/04', '4 dias', 'amber'], ['Lúcia Ferraz', 'Exportação de dados', '12/05', '13 dias', ''], ['Paulo Gomes', 'Correção de dados', '02/05', 'Concluído', 'teal']].map(r => <tr key={r[0]}><td style={{ fontWeight: 500 }}>{r[0]}</td><td className="stone">{r[1]}</td><td className="num stone">{r[2]}</td><td><span className={`badge ${r[4]}`}>{r[3]}</span></td><td><button className="btn secondary sm">Abrir</button></td></tr>)}</tbody></table>
        </Section>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Section title="Retenção vencendo" o="api"><div className="row" style={{ gap: 10 }}><span className="num" style={{ fontSize: 26, fontWeight: 500 }}>12</span><span className="stone">cadastros de visitantes sem interação há mais de 2 anos</span></div><button className="btn secondary sm" style={{ marginTop: 12 }}>Revisar</button></Section>
          <Section title="Termos e política da igreja" o="promessa"><p className="stone">Texto próprio de termos de uso e política de privacidade, exibido no app e nas páginas públicas.</p><button className="btn secondary sm" style={{ marginTop: 12 }}><Ic n="edit" s={13} />Editar textos</button></Section>
        </div>
      </div>
    </Stateful>
  </>
);
const AdmAuditoria = () => (
  <>
    <PageHeader over="Administração" title="Auditoria" o="existe" sub="Log da igreja, incluindo acessos do suporte Orbien." actions={<><button className="btn secondary sm">Ação<Ic n="chev-d" s={13} /></button><button className="btn secondary sm">Últimos 7 dias<Ic n="chev-d" s={13} /></button></>} />
    <Stateful>
      <div className="card" style={{ overflow: 'hidden' }}><table className="tbl"><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhe</th></tr></thead><tbody>{[['14/05 15h02', 'Ricardo Nunes', 'lancamento.editar', 'Energia elétrica · maio'], ['14/05 11h40', 'Suporte Orbien', 'suporte.sessao_iniciada', 'Chamado #4821 · autorizado por Marcos'], ['14/05 09h12', 'Sônia Ramos', 'pessoa.criar', 'Marina Rodrigues'], ['13/05 22h31', 'Carla Souza', 'encontro.presenca', 'Vila Mariana · 10/12'], ['13/05 18h00', 'Marcos Teixeira', 'papel.alterar', 'Roberto Lemos → Líder de ministério']].map((r, i) => <tr key={i}><td className="num stone" style={{ fontSize: 12.5 }}>{r[0]}</td><td style={{ fontWeight: 500 }}>{r[1] === 'Suporte Orbien' ? <span className="badge crimson">{r[1]}</span> : r[1]}</td><td className="mono" style={{ fontSize: 12 }}>{r[2]}</td><td className="stone">{r[3]}</td></tr>)}</tbody></table></div>
    </Stateful>
  </>
);

Object.assign(window, { FinGeral, FinLanc, FinDoacoes, FinRel, FinConc, FinExp, FinCad, AdmIgreja, AdmUsuarios, AdmIdentidade, AdmPlano, AdmLgpd, AdmAuditoria });
