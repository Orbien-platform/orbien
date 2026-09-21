/**
 * Papéis com acesso à Bíblia (biblia-nvi-marcacoes-mobile, design.md
 * "Papéis (BIBLE_ROLES)"). Mesma lista ampla de `PRAYER_ROLES`/`CHAT_ROLES`:
 * leitura e criação para todos — Bíblia é conteúdo de congregação como um
 * todo, não de célula. Moderação (apagar marcação alheia) é decidida no
 * service, não aqui — mesmo princípio "`@Roles` é rejeição barata" de
 * `prayer-requests.controller.ts`.
 *
 * Compartilhada por `BibleReaderController` (T10) e
 * `BibleVerseMarksController` (T13): as duas metades do módulo usam a MESMA
 * lista, então o invariante de `roles-invariant.spec.ts` (todo controller
 * cita `@Roles`) e o de "todo papel citado existe" valem para as duas sem
 * duplicar a lista.
 */
export const BIBLE_ROLES = [
  'member',
  'cell_leader',
  'secretary',
  'pastor',
  'admin_congregation',
  'tenant_admin',
];
