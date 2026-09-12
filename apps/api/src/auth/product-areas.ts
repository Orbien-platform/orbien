/**
 * As áreas do produto, e quem lê cada uma.
 *
 * Esta é a **lista canônica**. Até aqui ela não existia em lugar nenhum: a
 * informação vivia espalhada nos `const READ_ROLES` de seis controllers, e o
 * `apps/web` mantinha uma sétima cópia em `src/lib/permissions.ts` só para
 * decidir que link desenhar na barra lateral. Cópia que ninguém sincroniza
 * diverge; o que fecha isso não é mais um teste de espelho, é a lista passar
 * a ter um dono só.
 *
 * Quem decide continua sendo o `RolesGuard`, avaliando o `@Roles` de cada
 * rota — e por baixo dele o RLS. O que mudou é de onde o `@Roles` de leitura
 * dessas seis áreas tira os papéis: daqui. `GET /me/permissions` responde a
 * partir da mesma constante, então a barra lateral do web não adivinha mais.
 *
 * **Área não é rota.** A chave abaixo é o nome do domínio, não o caminho da
 * tela — o backend não conhece as URLs do front, e o front é quem mapeia
 * `/pessoas` → `persons`. Rota nova numa área existente não mexe aqui.
 *
 * Só entram áreas cujo READ é recortado por papel. Ficam de fora, de
 * propósito:
 *
 *   dashboard      monta-se de chamadas independentes e já renderiza só o que
 *                  carregou; recortá-lo por papel esconderia a home de quem
 *                  enxerga parte dela.
 *   configurações  `GET /settings` não tem `@Roles` — é aberto a qualquer
 *                  sessão autenticada. Quem não pode gravar toma 403 no PATCH.
 *   repertório     `GET /songs` também não tem `@Roles`: o catálogo é próprio,
 *                  e a escrita é decidida dentro da tela.
 */

export const PRODUCT_AREA_READ_ROLES = {
  persons: ['tenant_admin', 'admin_congregation', 'pastor', 'secretary', 'treasurer'],
  small_groups: [
    'tenant_admin',
    'admin_congregation',
    'pastor',
    'secretary',
    'treasurer',
    'cell_leader',
  ],
  financial: ['admin_congregation', 'treasurer', 'tenant_admin'],
  content: ['admin_congregation', 'pastor', 'secretary', 'tenant_admin', 'member'],
  volunteers: ['admin_congregation', 'pastor', 'tenant_admin', 'secretary', 'ministry_leader'],
  celebrations: ['admin_congregation', 'pastor', 'tenant_admin', 'secretary', 'ministry_leader'],
} as const satisfies Record<string, readonly string[]>;

export type ProductArea = keyof typeof PRODUCT_AREA_READ_ROLES;

export const PRODUCT_AREAS = Object.keys(PRODUCT_AREA_READ_ROLES) as ProductArea[];

/**
 * As áreas que esta sessão lê.
 *
 * `support_session` recebe todas pelo mesmo motivo que passa no `RolesGuard`:
 * a sessão de suporte satisfaz qualquer `@Roles` em GET, e responder menos
 * aqui faria a barra lateral mentir sobre o que ela alcança. Cada uma dessas
 * leituras vira uma linha `support_access` em `audit_logs` — o rastro existe.
 */
export function readableAreas(user: {
  roles: string[];
  support_session?: boolean;
}): ProductArea[] {
  if (user.support_session === true) return [...PRODUCT_AREAS];

  return PRODUCT_AREAS.filter((area) =>
    (PRODUCT_AREA_READ_ROLES[area] as readonly string[]).some((role) =>
      user.roles.includes(role),
    ),
  );
}
