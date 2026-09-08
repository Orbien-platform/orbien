// Tipos puros do feed de Conteúdo (MOB-06) — espelham o shape de
// `GET /content/posts` (`apps/api/src/content/posts.service.ts:66-96`),
// sem importar código do Nest. Ver design.md, "Rodada 3 — MOB-06", Data
// Models. Só os campos que a tela de leitura usa — `is_draft`,
// `expires_at`, `created_by_user_id` ficam fora (mesmo princípio de
// reuso mínimo das rodadas anteriores).

export interface Post {
  id: string;
  type: string;
  title: string;
  body: string | null;
  media_url: string | null;
  published_at: string | null;
  created_at: string;
}

export interface PostsPage {
  data: Post[];
  total: number;
}
