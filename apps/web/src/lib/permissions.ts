/**
 * Quais papéis enxergam cada tela do `(admin)`.
 *
 * **A autoridade é o servidor, não este arquivo.** Quem decide é o `@Roles` de
 * cada controller da API, avaliado pelo `RolesGuard`, e por baixo dele o RLS.
 * O que existe aqui é a mesma informação repetida para uma finalidade só:
 * não desenhar na barra lateral um link que só levaria a um 403. Se este mapa
 * divergir do servidor, o efeito é cosmético nos dois sentidos — link a menos
 * (a tela segue alcançável pela URL) ou link a mais (a tela responde "sem
 * acesso", que é o outro lado desta mesma mudança). Em nenhum caso ele abre
 * dado.
 *
 * Os papéis abaixo espelham o READ de cada área, na API:
 *
 *   /pessoas       persons.controller.ts        READ_ROLES
 *   /grupos        small-groups.controller.ts   READ_ROLES
 *   /financeiro    transactions.controller.ts   READ_ROLES
 *   /conteudo      posts.controller.ts          ALL_ROLES
 *   /voluntarios   ministries.controller.ts     READ_ROLES
 *   /celebracoes   celebrations.controller.ts   READ_ROLES
 *
 * Duas telas ficam de fora do mapa, e é de propósito:
 *
 *   /dashboard      monta-se de quatro chamadas independentes (`allSettled`) e
 *                   já renderiza só o que carregou; recortá-la por papel aqui
 *                   esconderia a home de quem enxerga parte dela.
 *   /configuracoes  o `GET /settings` não tem `@Roles` — é aberto a qualquer
 *                   sessão autenticada. Quem não pode gravar recebe 403 no
 *                   PATCH, que é outra conversa.
 */

/** Papéis com leitura, por rota. Rota ausente = visível para todo autenticado. */
export const NAV_READ_ROLES: Record<string, readonly string[]> = {
  "/pessoas": ["tenant_admin", "admin_congregation", "pastor", "secretary", "treasurer"],
  "/grupos": [
    "tenant_admin",
    "admin_congregation",
    "pastor",
    "secretary",
    "treasurer",
    "cell_leader",
  ],
  "/financeiro": ["tenant_admin", "admin_congregation", "treasurer"],
  "/conteudo": ["tenant_admin", "admin_congregation", "pastor", "secretary", "member"],
  "/voluntarios": [
    "tenant_admin",
    "admin_congregation",
    "pastor",
    "secretary",
    "ministry_leader",
  ],
  "/celebracoes": [
    "tenant_admin",
    "admin_congregation",
    "pastor",
    "secretary",
    "ministry_leader",
  ],
};

interface AccessSubject {
  roles: string[];
  support_session: boolean;
}

/**
 * A sessão pode chegar à tela?
 *
 * `support_session` passa em tudo pelo mesmo motivo que passa no `RolesGuard`:
 * a sessão de suporte satisfaz qualquer `@Roles` em GET, e esconder links dela
 * seria mentir sobre o que ela alcança — cada uma dessas leituras vira uma
 * linha `support_access` em `audit_logs`, então o rastro existe.
 */
export function canAccessRoute(
  subject: AccessSubject | null | undefined,
  href: string
): boolean {
  if (!subject) return false;
  if (subject.support_session) return true;

  const allowed = NAV_READ_ROLES[href];
  if (!allowed) return true;

  return subject.roles.some((role) => allowed.includes(role));
}
