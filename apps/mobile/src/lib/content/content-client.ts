// ContentClient (MOB-06) — wrapper tipado sobre `authenticatedRequest`
// para `GET /content/posts`. Mesmo princípio de separação `*-client.ts`
// (lógica) vs. tela (UI) de `escala-client.ts`/`auth-client.ts`.
import { authenticatedRequest } from "../auth/auth-client";
import type {
  EventRegistrationSummary,
  MyEventRegistration,
  PaidEventRegistrationResult,
  Post,
  PostsPage,
  RegisterSelfResult,
} from "./types";

/**
 * `GET /content/posts` (MOB-06, AC2) — paginação offset/page da API
 * (`page`/`limit`), sem cursor. `page`/`limit` omitidos usam os defaults
 * do backend (1/20).
 *
 * Sempre com `published=true`: o app é vitrine. Sem isso, quem tem papel de
 * escrita (pastor, admin) via o próprio rascunho no feed e na home — a API só
 * esconde rascunho sozinha de `member` puro.
 */
export async function getPosts(page?: number, limit?: number): Promise<PostsPage> {
  const params = new URLSearchParams({ published: "true" });
  if (page !== undefined) params.set("page", String(page));
  if (limit !== undefined) params.set("limit", String(limit));
  const query = params.toString();
  return authenticatedRequest<PostsPage>("get", `/content/posts${query ? `?${query}` : ""}`);
}

/**
 * `GET /content/posts/highlights` — os posts que a igreja escolheu no web
 * para o carrossel da home, já na ordem e só os publicados. Lista vazia é
 * "ninguém escolheu": a home cai nos últimos publicados.
 */
export async function getHighlights(): Promise<Post[]> {
  return authenticatedRequest<Post[]>("get", "/content/posts/highlights");
}

/**
 * `GET /content/posts/:id` (MOB-07, AC4) — tela de detalhe do post,
 * destino do toque numa push (e do toque num item da lista, T8).
 */
export async function getPost(id: string): Promise<Post> {
  return authenticatedRequest<Post>("get", `/content/posts/${id}`);
}

// ─── Inscrição em evento (PROD-25) ───────────────────────────────────────────
//
// Duas portas em `content/posts/:postId/registrations`, e o membro só entra
// por uma: `.../summary` (vagas e prazo, sem a lista de nomes) e `.../me`
// (a própria inscrição). A raiz é do organizador e responde 403 aqui — não
// existe função para ela neste client, de propósito.

/** `GET .../registrations/summary` — vagas, prazo e preço do evento. */
export async function getEventRegistrationSummary(
  postId: string,
): Promise<EventRegistrationSummary> {
  return authenticatedRequest<EventRegistrationSummary>(
    "get",
    `/content/posts/${postId}/registrations/summary`,
  );
}

/** `GET .../registrations/me` — `null` quando o usuário não se inscreveu. */
export async function getMyEventRegistration(
  postId: string,
): Promise<MyEventRegistration | null> {
  return authenticatedRequest<MyEventRegistration | null>(
    "get",
    `/content/posts/${postId}/registrations/me`,
  );
}

/**
 * `POST .../registrations/me` — sem corpo: nome e pessoa saem do cadastro,
 * então ninguém se inscreve como outra pessoa.
 *
 * Evento gratuito volta já confirmado (ou `waitlisted`, se lotado); evento
 * pago volta `{ registration, payment }`, com a vaga reservada em
 * `pending_payment` e o QR do PIX. Use `isPaidRegistration` para separar.
 */
export async function registerSelfForEvent(postId: string): Promise<RegisterSelfResult> {
  return authenticatedRequest<RegisterSelfResult>(
    "post",
    `/content/posts/${postId}/registrations/me`,
  );
}

/** `DELETE .../registrations/me` — desistir. Não respeita o prazo, de
 * propósito: segurar a vaga de quem desistiu é o pior dos dois erros. */
export async function cancelMyEventRegistration(
  postId: string,
): Promise<MyEventRegistration> {
  return authenticatedRequest<MyEventRegistration>(
    "delete",
    `/content/posts/${postId}/registrations/me`,
  );
}

/** Discrimina os dois formatos de `registerSelfForEvent`. Testa `payment`
 * e não `registration`, porque a inscrição crua também tem `id` — só o
 * envelope pago tem as duas chaves. */
export function isPaidRegistration(
  result: RegisterSelfResult,
): result is PaidEventRegistrationResult {
  return "payment" in result;
}
