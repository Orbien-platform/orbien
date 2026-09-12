/**
 * Quais telas do `(admin)` esta sessão enxerga.
 *
 * **A autoridade é o servidor, não este arquivo.** Quem decide é o `@Roles` de
 * cada controller da API, avaliado pelo `RolesGuard`, e por baixo dele o RLS.
 * O que existe aqui é só o suficiente para não desenhar na barra lateral um
 * link que levaria a um 403.
 *
 * Antes o arquivo repetia, papel por papel, as listas de leitura de seis
 * controllers da API — cópia que ninguém sincroniza, mantida porque a regra do
 * monorepo impede importar `apps/api` e um pacote compartilhado acoplaria os
 * deploys por versão. Hoje quem responde é a própria API, em
 * `GET /me/permissions`, a partir da lista canônica em
 * `apps/api/src/auth/product-areas.ts`. O que sobrou aqui é o mapa de **rota
 * do front → área do produto**, que é informação do front: a API não conhece
 * as URLs destas telas.
 *
 * Três telas ficam de fora do mapa, e é de propósito:
 *
 *   /dashboard      monta-se de quatro chamadas independentes (`allSettled`) e
 *                   já renderiza só o que carregou; recortá-la por papel aqui
 *                   esconderia a home de quem enxerga parte dela.
 *   /configuracoes  o `GET /settings` não tem `@Roles` — é aberto a qualquer
 *                   sessão autenticada. Quem não pode gravar recebe 403 no
 *                   PATCH, que é outra conversa.
 *   /repertorio     o `GET /songs` também não tem `@Roles`: o catálogo de
 *                   músicas é próprio, e a escrita é decidida dentro da tela.
 */

/** Rota do front → área do produto, como a API as nomeia. */
export const ROUTE_AREAS: Record<string, string> = {
  "/pessoas": "persons",
  "/grupos": "small_groups",
  "/financeiro": "financial",
  "/conteudo": "content",
  "/voluntarios": "volunteers",
  "/celebracoes": "celebrations",
};

interface AccessSubject {
  /**
   * As áreas que a API disse que esta sessão lê, ou `null` quando não deu para
   * perguntar (API fora, token vencido antes da primeira renovação).
   */
  areas: string[] | null;
}

/**
 * A sessão pode chegar à tela?
 *
 * `areas: null` libera tudo, e é a degradação certa: sem resposta da API, a
 * escolha é entre desenhar link a mais ou esconder a navegação inteira de
 * quem tem acesso legítimo. Link a mais leva a uma tela que responde "sem
 * acesso"; esconder tudo trava quem podia trabalhar. Em nenhum dos dois casos
 * há dado exposto — quem nega continua sendo o `RolesGuard`, e o RLS.
 *
 * A sessão de suporte não precisa de ramo próprio: a API já responde todas as
 * áreas para ela, pelo mesmo motivo que o `RolesGuard` a deixa passar em GET.
 */
export function canAccessRoute(
  subject: AccessSubject | null | undefined,
  href: string
): boolean {
  if (!subject) return false;
  if (subject.areas === null) return true;

  const area = ROUTE_AREAS[href];
  if (!area) return true;

  return subject.areas.includes(area);
}
