// Conteúdo do QR de check-in do encontro (PROD-12).
//
// O token de `POST /small-groups/meetings/:id/checkin-token` é um UUID cru.
// O app não o põe cru no QR: leva um prefixo próprio, para o leitor do
// membro reconhecer o QR do líder e recusar na hora qualquer outro código
// que a câmera pegar (o QR de autocadastro projetado no telão, um boleto,
// um cardápio) sem gastar uma chamada que só devolveria "inválido".
//
// O painel (`GroupDetailSheet`) mostra o token em texto, sem prefixo — por
// isso o leitor também aceita o UUID puro.
const PREFIX = "orbien:checkin:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildCheckinPayload(token: string): string {
  return `${PREFIX}${token}`;
}

/** O token, se o texto lido for um QR de check-in; `null` se não for. */
export function parseCheckinPayload(data: string): string | null {
  const text = data.trim();
  const token = text.toLowerCase().startsWith(PREFIX) ? text.slice(PREFIX.length) : text;
  return UUID.test(token) ? token : null;
}
