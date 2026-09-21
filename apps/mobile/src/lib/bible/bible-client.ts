// BibleClient (biblia-nvi-marcacoes-mobile, T15) — wrapper fino sobre
// `authenticatedRequest` para as 6 operações da Bíblia NVI, mesmo padrão de
// `content-client.ts`: cada função chama um único endpoint, sem lógica de
// tela aqui dentro.
import { authenticatedRequest } from "../auth/auth-client";
import type { BibleBook, BibleChapter, BibleFeedPage, BibleVerseMark, CreateMarkInput } from "./types";

/** `GET /bible/books` — lista canônica dos 66 livros. */
export async function getBooks(): Promise<BibleBook[]> {
  return authenticatedRequest<BibleBook[]>("get", "/bible/books");
}

/** `GET /bible/books/:bookCode/chapters/:chapter` — capítulo cache-first. */
export async function getChapter(bookCode: string, chapter: number): Promise<BibleChapter> {
  return authenticatedRequest<BibleChapter>("get", `/bible/books/${bookCode}/chapters/${chapter}`);
}

/** `POST /bible/marks` — marca um intervalo de versículos com comentário. */
export async function createMark(input: CreateMarkInput): Promise<BibleVerseMark> {
  return authenticatedRequest<BibleVerseMark>("post", "/bible/marks", { body: input });
}

/** `PATCH /bible/marks/:id` — edita o texto do próprio comentário. */
export async function updateMark(id: string, comment: string): Promise<BibleVerseMark> {
  return authenticatedRequest<BibleVerseMark>("patch", `/bible/marks/${id}`, { body: { comment } });
}

/** `DELETE /bible/marks/:id` — soft delete (autor ou moderador). */
export async function deleteMark(id: string): Promise<{ id: string }> {
  return authenticatedRequest<{ id: string }>("delete", `/bible/marks/${id}`);
}

/** `GET /bible/feed` — feed da congregação, paginado por cursor (`before`). */
export async function getFeed(params?: { before?: string; limit?: number }): Promise<BibleFeedPage> {
  const query = new URLSearchParams();
  if (params?.before !== undefined) query.set("before", params.before);
  if (params?.limit !== undefined) query.set("limit", String(params.limit));
  const qs = query.toString();
  return authenticatedRequest<BibleFeedPage>("get", `/bible/feed${qs ? `?${qs}` : ""}`);
}
