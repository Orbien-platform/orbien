// PermissionsClient — busca `GET /me/permissions`, mesmo contrato que
// `apps/web/src/lib/session.ts:fetchAreas` já consome. Único consumidor
// mobile até aqui é o gate da aba Escala (design.md).
import { authenticatedRequest } from "../auth/auth-client";

/**
 * As áreas do produto que esta sessão lê, segundo a API. `null` quando não
 * deu para perguntar (rede, token vencido, resposta malformada) — fail-open:
 * quem nega o acesso de verdade continua sendo a API nas rotas de cada área,
 * nunca esta chamada. Nunca lança.
 */
export async function fetchAreas(): Promise<string[] | null> {
  try {
    const response = await authenticatedRequest<{ areas?: unknown }>("get", "/me/permissions");
    return Array.isArray(response?.areas) ? (response.areas as string[]) : null;
  } catch {
    return null;
  }
}
