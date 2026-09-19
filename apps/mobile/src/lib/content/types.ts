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
  // Campos de evento (PROD-16/PROD-24), preenchidos só em `type: "event"`:
  // o `PostsService` recusa campo de evento fora desse tipo, então em post
  // comum eles chegam nulos/false. `GET /content/posts/:id` devolve a linha
  // inteira de `content_posts` — não há `select`, então já vinham no corpo
  // antes desta tela existir.
  event_starts_at?: string | null;
  event_ends_at?: string | null;
  event_location?: string | null;
  registration_enabled?: boolean;
}

export interface PostsPage {
  data: Post[];
  total: number;
}

// ─── Evento e inscrição (PROD-16 Starter, PROD-24 Premium, tela em PROD-25) ──
//
// Os campos de evento vivem no próprio post (`content_posts`): o evento
// nunca ganhou modelo próprio — `ContentPostType.event` já existia e o que
// faltava era o post carregar quando, onde e com quais regras de inscrição.
// Quem tem tabela é a inscrição (`event_registrations`).

export type EventRegistrationStatus =
  | "confirmed"
  | "waitlisted"
  | "pending_payment"
  | "cancelled";

export type EventRegistrationPaymentStatus =
  | "not_required"
  | "pending"
  | "paid"
  | "refunded";

/** `GET .../registrations/summary` — vagas e prazo, sem a lista de nomes:
 * é exatamente o que a tela de quem vai se inscrever pode ver (a lista é
 * do organizador e responde 403 para `member`). */
export interface EventRegistrationSummary {
  registration_enabled: boolean;
  registration_limit: number | null;
  registration_deadline: string | null;
  registrations_closed: boolean;
  confirmed_count: number;
  waitlisted_count: number;
  /** NULL é evento sem limite de vagas. */
  seats_left: number | null;
  /** NULL é evento gratuito (PROD-16). Setado, é pago — Premium (PROD-24). */
  registration_price: number | null;
}

/** A inscrição do próprio usuário (`GET`/`POST`/`DELETE .../registrations/me`).
 * Só os campos que a tela usa — `tenant_id`, `email`, `phone` e companhia
 * ficam fora, mesmo princípio de reuso mínimo de `Post`. */
export interface MyEventRegistration {
  id: string;
  full_name: string;
  status: EventRegistrationStatus;
  payment_status: EventRegistrationPaymentStatus;
  created_at: string;
}

/** O PIX dinâmico que `POST .../registrations/me` devolve em evento pago. */
export interface EventRegistrationPayment {
  payment_id: string;
  /** Payload "copia e cola" do PIX. */
  qr_code: string;
  /** PNG em base64 **sem** o prefixo `data:` — quem monta a URI é a tela. */
  qr_code_image: string;
  amount: number;
  expires_at: string;
}

/**
 * Retorno de `POST .../registrations/me`, que muda de forma conforme o
 * evento: gratuito devolve a inscrição já confirmada (ou na fila), pago
 * devolve `{ registration, payment }` com a vaga reservada em
 * `pending_payment` e o QR para pagar. Quem separa os dois é
 * `isPaidRegistration` em `content-client.ts`.
 */
export interface PaidEventRegistrationResult {
  registration: MyEventRegistration;
  payment: EventRegistrationPayment;
}

export type RegisterSelfResult = MyEventRegistration | PaidEventRegistrationResult;
