// Mock data — Igreja Vida Nova · Congregação Vila Mariana
const CHURCH = { name: 'Igreja Vida Nova', cong: 'Vila Mariana', city: 'São Paulo', domain: 'vidanova.orbien.app' };

const PEOPLE = [
  { id: 1, name: 'Marina Rodrigues', bond: 'Visitante', origin: 'QR do culto', since: '11/05/2026', phone: '(11) 98421-3302', sex: 'F', age: 27, group: null, visits: 2 },
  { id: 2, name: 'João Bessa', bond: 'Visitante', origin: 'Célula Vila Mariana', since: '09/05/2026', phone: '(11) 99102-4418', sex: 'M', age: 34, group: 'Vila Mariana', visits: 1 },
  { id: 3, name: 'Júlia Mendes', bond: 'Membro', origin: 'Cadastro manual', since: '2022', phone: '(11) 97733-1290', sex: 'F', age: 31, group: 'Vila Mariana', visits: 0 },
  { id: 4, name: 'Pedro Lima', bond: 'Membro', origin: 'Importação CSV', since: '2019', phone: '(11) 98810-2234', sex: 'M', age: 42, group: 'Vila Mariana', visits: 0 },
  { id: 5, name: 'André Costa', bond: 'Frequentador', origin: 'QR do culto', since: '03/2026', phone: '(11) 99876-0021', sex: 'M', age: 23, group: 'Jovens Centro', visits: 4 },
  { id: 6, name: 'Renata Alves', bond: 'Membro', origin: 'Importação CSV', since: '2018', phone: '(11) 98123-7745', sex: 'F', age: 51, group: 'Moema Casais', visits: 0 },
  { id: 7, name: 'Tiago Mendes', bond: 'Frequentador', origin: 'Evento: Conferência', since: '01/2026', phone: '(11) 97455-8812', sex: 'M', age: 29, group: 'Jovens Centro', visits: 3 },
  { id: 8, name: 'Carla Souza', bond: 'Membro', origin: 'Cadastro manual', since: '2015', phone: '(11) 99234-5671', sex: 'F', age: 39, group: 'Vila Mariana', visits: 0, role: 'Líder' },
  { id: 9, name: 'Larissa Pinto', bond: 'Visitante', origin: 'Evento: Jovens', since: '09/05/2026', phone: '(11) 98777-1100', sex: 'F', age: 19, group: null, visits: 1 },
  { id: 10, name: 'Felipe Oliveira', bond: 'Membro', origin: 'Importação CSV', since: '2022', phone: '(11) 99001-3344', sex: 'M', age: 36, group: 'Saúde Família', visits: 0 },
];

const GROUPS = [
  { id: 1, name: 'Vila Mariana', type: 'Adultos', net: 'Rede Sul', leader: 'Carla Souza', day: 'Quarta · 20h', members: 12, health: 'green', att: 83, visitors: 3, address: 'R. Domingos de Morais, 1200' },
  { id: 2, name: 'Jovens Centro', type: 'Jovens', net: 'Rede Centro', leader: 'Lucas Pereira', day: 'Sexta · 19h30', members: 18, health: 'green', att: 76, visitors: 5, address: 'Av. Paulista, 900 · ap 52' },
  { id: 3, name: 'Moema Casais', type: 'Casais', net: 'Rede Sul', leader: 'Renata e Paulo', day: 'Terça · 20h', members: 10, health: 'amber', att: 61, visitors: 0, address: 'Al. Jurupis, 410' },
  { id: 4, name: 'Saúde Família', type: 'Famílias', net: 'Rede Sul', leader: 'Felipe Oliveira', day: 'Quinta · 20h', members: 9, health: 'red', att: 42, visitors: 0, address: 'R. Loefgren, 77' },
  { id: 5, name: 'Mulheres Ipiranga', type: 'Mulheres', net: 'Rede Leste', leader: 'Vânia Santos', day: 'Sábado · 15h', members: 14, health: 'green', att: 80, visitors: 2, address: 'R. Bom Pastor, 2100' },
  { id: 6, name: 'Universitários', type: 'Jovens', net: 'Rede Centro', leader: 'Tiago Mendes', day: 'Quinta · 19h', members: 11, health: 'amber', att: 64, visitors: 1, address: 'R. Maria Antônia, 300' },
];

const CELEBS = [
  { id: 1, name: 'Celebração da manhã', date: 'Dom · 17/05', time: '10h00', status: 'OC publicada', theme: 'Fé que permanece', host: 'Roberto Lemos', preacher: 'Pr. Daniel Alves', open: 1, pending: 2 },
  { id: 2, name: 'Celebração da noite', date: 'Dom · 17/05', time: '18h30', status: 'Rascunho', theme: 'Fé que permanece', host: 'Júlia Mendes', preacher: 'Pr. Daniel Alves', open: 3, pending: 1 },
  { id: 3, name: 'Culto de oração', date: 'Qua · 20/05', time: '20h00', status: 'Rascunho', theme: 'Intercessão', host: 'Carla Souza', preacher: 'Pra. Ana Reis', open: 0, pending: 0 },
  { id: 4, name: 'Celebração da manhã', date: 'Dom · 24/05', time: '10h00', status: 'Não iniciada', theme: '—', host: '—', preacher: 'Pr. Daniel Alves', open: 6, pending: 0 },
];

const OC_STEPS = [
  { t: '09h55', d: 5, name: 'Abertura e boas-vindas', who: 'Roberto Lemos', min: 'Host' },
  { t: '10h00', d: 25, name: 'Louvor', who: 'Ministério de Louvor', min: 'Louvor', setlist: true },
  { t: '10h25', d: 5, name: 'Avisos', who: 'Júlia Mendes', min: 'Comunicação' },
  { t: '10h30', d: 10, name: 'Ofertório', who: 'Pedro Lima', min: 'Diaconia' },
  { t: '10h40', d: 40, name: 'Pregação · Hebreus 11', who: 'Pr. Daniel Alves', min: 'Pastoral' },
  { t: '11h20', d: 10, name: 'Ministração e encerramento', who: 'Pr. Daniel Alves', min: 'Pastoral' },
];
const SETLIST = [
  { title: 'Grande é o Senhor', key: 'G', bpm: 72 },
  { title: 'Santo Espírito', key: 'D', bpm: 68 },
  { title: 'Bondade de Deus', key: 'A', bpm: 64 },
  { title: 'Aclame ao Senhor', key: 'E', bpm: 120 },
];
const MINISTRIES = ['Louvor', 'Mídia', 'Recepção', 'Infantil', 'Diaconia', 'Som'];

const POSTS = [
  { id: 1, title: 'Conferência de Jovens 2026 · inscrições abertas', type: 'Evento', status: 'Publicado', when: '12/05 · 09h', aud: 'Jovens', reach: 412 },
  { id: 2, title: 'Devocional · Salmo 23', type: 'Devocional', status: 'Agendado', when: '18/05 · 06h', aud: 'Todos', reach: null },
  { id: 3, title: 'Pregação · Fé que permanece (parte 2)', type: 'Vídeo', status: 'Publicado', when: '11/05 · 14h', aud: 'Todos', reach: 638 },
  { id: 4, title: 'Batismo nas águas · 31 de maio', type: 'Aviso', status: 'Rascunho', when: '—', aud: 'Frequentadores', reach: null },
  { id: 5, title: 'Plano de leitura · Hebreus em 13 dias', type: 'Plano de leitura', status: 'Agendado', when: '19/05 · 06h', aud: 'Todos', reach: null },
  { id: 6, title: 'Pedido de oração da liderança', type: 'Oração', status: 'Publicado', when: '10/05 · 20h', aud: 'Membros', reach: 287 },
];

const MATERIALS = [
  { id: 1, title: 'Estudo 12 · A fé de Abraão', kind: 'Texto', target: 'Todas as células', from: '18/05', until: '25/05', open: 64, total: 6, tags: ['Hebreus', 'Fé'], ver: 3, origin: 'Congregação' },
  { id: 2, title: 'Estudo 11 · Enoque e Noé', kind: 'PDF', target: 'Todas as células', from: '11/05', until: '18/05', open: 88, total: 6, tags: ['Hebreus'], ver: 1, origin: 'Congregação' },
  { id: 3, title: 'Encontro de casais · Comunicação', kind: 'PDF', target: 'Tipo: Casais', from: '20/05', until: '—', open: 0, total: 1, tags: ['Casais'], ver: 1, origin: 'Denominação' },
  { id: 4, title: 'Quebra-gelo para jovens', kind: 'Link', target: 'Tipo: Jovens', from: '04/05', until: '—', open: 71, total: 2, tags: ['Dinâmica'], ver: 2, origin: 'Congregação' },
];

const ENTRIES = [
  { d: '14/05', desc: 'Dízimos · culto de domingo', cat: 'Dízimo', cc: 'Geral', v: 8420, st: 'Conciliado' },
  { d: '14/05', desc: 'Ofertas · culto de domingo', cat: 'Oferta', cc: 'Geral', v: 2310, st: 'Conciliado' },
  { d: '13/05', desc: 'Energia elétrica · maio', cat: 'Utilidades', cc: 'Templo', v: -1284.5, st: 'Pendente' },
  { d: '12/05', desc: 'Aluguel do salão · parcela 5/12', cat: 'Aluguel', cc: 'Templo', v: -4500, st: 'Pago' },
  { d: '12/05', desc: 'PIX · Missões', cat: 'Missões', cc: 'Missões', v: 1150, st: 'Conciliado' },
  { d: '10/05', desc: 'Material infantil', cat: 'Ministérios', cc: 'Infantil', v: -386.9, st: 'Pendente' },
  { d: '09/05', desc: 'Conferência de Jovens · inscrições PIX', cat: 'Eventos', cc: 'Jovens', v: 3240, st: 'Conciliado' },
];

Object.assign(window, { CHURCH, PEOPLE, GROUPS, CELEBS, OC_STEPS, SETLIST, MINISTRIES, POSTS, MATERIALS, ENTRIES });
