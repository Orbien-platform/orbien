// ContentClient (MOB-06) — wrapper tipado sobre `authenticatedRequest`
// para `GET /content/posts`. Mesmo princípio de separação `*-client.ts`
// (lógica) vs. tela (UI) de `escala-client.ts`/`auth-client.ts`.
import { authenticatedRequest } from "../auth/auth-client";
import type { Post, PostsPage } from "./types";

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

/**
 * `GET /content/posts/:id` (MOB-07, AC4) — tela de detalhe do post,
 * destino do toque numa push (e do toque num item da lista, T8).
 */
export async function getPost(id: string): Promise<Post> {
  return authenticatedRequest<Post>("get", `/content/posts/${id}`);
}
