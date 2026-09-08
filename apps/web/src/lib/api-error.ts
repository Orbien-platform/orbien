import axios from "axios";

/**
 * Mensagem de erro de API pronta para a tela.
 *
 * A regra é uma só: mensagem que veio do servidor só chega ao usuário quando é
 * de erro do cliente (4xx). São as que o backend escreve em português e
 * explicam o que fazer ("Música não encontrada", "Você não tem permissão").
 *
 * De 5xx para cima o corpo é o padrão do Nest — `{"statusCode":500,
 * "message":"Internal server error"}` — e repassá-lo colocava a string
 * "Internal server error" na cara de quem abria o menu Repertório. Erro de
 * servidor não tem mensagem útil para o usuário: cai no `fallback` do chamador,
 * que é escrito no idioma e no contexto da tela. O detalhe técnico continua
 * inteiro no console do navegador e no log do servidor.
 *
 * Erro sem resposta (rede caiu, CORS, timeout) também cai no `fallback`: não há
 * mensagem do servidor para considerar.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (!axios.isAxiosError(err)) return fallback;

  if (!err.response) return fallback;
  if (typeof err.response.status === "number" && err.response.status >= 500) return fallback;

  const message: unknown = err.response.data?.message;
  if (typeof message === "string" && message.trim()) return message;
  // O Nest devolve array de strings quando o ValidationPipe reprova o corpo.
  if (Array.isArray(message) && typeof message[0] === "string") return message[0];

  return fallback;
}
