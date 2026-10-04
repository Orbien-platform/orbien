import axios from "axios";

/**
 * Traduz a falha de `PATCH /platform/user-accounts/:id/transfer` numa frase
 * que diz o que corrigir. As mensagens de 400/404 da API já são em português
 * e específicas (destino igual à origem, tenant inativo, congregação de outro
 * tenant, conta inexistente) — quando vêm como texto, valem mais do que
 * qualquer paráfrase daqui. `message` em array é a validação do DTO
 * (`@IsUUID()`), que não diz nada útil para quem opera.
 */
export function transferErrorMessage(err: unknown): string {
  if (!axios.isAxiosError(err) || !err.response) {
    return "Não foi possível falar com a API. Confira a conexão e tente de novo.";
  }
  const { status, data } = err.response as {
    status: number;
    data?: { message?: unknown };
  };
  const message = typeof data?.message === "string" ? data.message : null;

  if (status === 400) {
    return message ?? "Dados inválidos. Confira os IDs informados.";
  }
  if (status === 404) {
    return message ?? "Conta ou congregação de destino não encontrada.";
  }
  if (status === 403) {
    return "Sua conta não tem permissão para transferir contas.";
  }
  return "Não foi possível transferir a conta. Nada foi alterado — tente de novo.";
}
