// ContentClient (MOB-06) — wrapper tipado sobre `authenticatedRequest`
// para `GET /content/posts`. Mesmo princípio de separação `*-client.ts`
// (lógica) vs. tela (UI) de `escala-client.ts`/`auth-client.ts`.
import { authenticatedRequest } from "../auth/auth-client";
import type { PostsPage } from "./types";

/**
 * `GET /content/posts` (MOB-06, AC2) — paginação offset/page da API
 * (`page`/`limit`), sem cursor. `page`/`limit` omitidos usam os defaults
 * do backend (1/20).
 */
export async function getPosts(page?: number, limit?: number): Promise<PostsPage> {
  const params = new URLSearchParams();
  if (page !== undefined) params.set("page", String(page));
  if (limit !== undefined) params.set("limit", String(limit));
  const query = params.toString();
  return authenticatedRequest<PostsPage>("get", `/content/posts${query ? `?${query}` : ""}`);
}
