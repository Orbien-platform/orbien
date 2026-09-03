/**
 * Cobertura permanente da tela de Grupos.
 *
 * Mesma motivação da spec de pessoas: o `c84fc02` reescreveu os effects desta
 * tela e do `GroupDetailSheet`, e a verificação da época foi manual. Ver a
 * pendência nº 4 de docs/PENDENCIAS.md.
 *
 *   #1 reset de sheet no fechamento
 *   #2 recarga após mutação incrementa um tick em vez de aguardar o load
 *   #3/#4 cancelamento de load no lugar do contador `fetchRef`
 *   #5 criar registro passou de 2 fetches para 1
 *
 * Uso: E2E_EMAIL=... E2E_PASSWORD=... E2E_TENANT=... npm run e2e -w orbien-web
 */

import { expect, shot, test, realConsoleErrors, unexpectedHttp } from "./fixtures";

interface Group { id: string; name: string }

test.describe("grupos", () => {
  test("cria, lista, busca e reabre o sheet", async ({ page, errorLog, api }) => {
    const stamp = Date.now();
    const nomeA = `Célula E2E A ${stamp}`;
    const nomeB = `Célula E2E B ${stamp}`;
    const busca = page.getByPlaceholder("Buscar grupos…");
    const criados: string[] = [];

    async function criarPelaUI(nome: string) {
      await page.getByRole("button", { name: "Novo grupo" }).click();
      await page.getByPlaceholder("ex: Célula Alfa").fill(nome);

      // O tipo é um select do base-ui: um <button> que abre um popup, não um
      // <select> nativo — `selectOption` não serve aqui. E o nome importa:
      // o <select> de líder, logo abaixo, também tem role=option, e um
      // `.first()` sem nome pegaria uma das opções nativas dele, invisíveis.
      await page.locator("#cg-type").click();
      await page.getByRole("option", { name: "Célula", exact: true }).click();

      await page.locator("#cg-leader").selectOption({ index: 1 });
      await page.getByRole("button", { name: "Criar grupo" }).click();
    }

    await test.step("tela abre vazia ou com a lista carregada", async () => {
      await page.goto("/grupos", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("button", { name: "Novo grupo" })).toBeVisible();
      await shot(page, "30-grupos-lista");
    });

    await test.step("#5 grupo criado aparece na lista sem recarregar", async () => {
      await criarPelaUI(nomeA);
      await expect(
        page.getByRole("cell", { name: nomeA }),
        "o grupo criado não apareceu na lista"
      ).toBeVisible();
    });

    await test.step("segundo grupo, para poder reabrir o sheet em outro registro", async () => {
      await criarPelaUI(nomeB);
      await expect(page.getByRole("cell", { name: nomeB })).toBeVisible();
    });

    await test.step("#3/#4 troca rápida de termo: vence o último", async () => {
      await busca.fill("Célula E2E A");
      await busca.fill("Célula E2E B");
      await expect(page.getByRole("cell", { name: nomeB })).toBeVisible();
      await expect(
        page.getByRole("cell", { name: nomeA }),
        "resposta antiga sobrescreveu o resultado do termo mais recente"
      ).toHaveCount(0);
      await busca.fill("");
      await expect(page.getByRole("cell", { name: nomeA })).toBeVisible();
    });

    await test.step("#1/#2 sheet reabre limpo em outro grupo", async () => {
      await page.getByRole("cell", { name: nomeA }).click();
      await expect(page.getByRole("heading", { name: nomeA })).toBeVisible();
      await page.getByRole("button", { name: "Close" }).click();
      await expect(page.getByRole("heading", { name: nomeA })).toHaveCount(0);

      await page.getByRole("cell", { name: nomeB }).click();
      await expect(
        page.getByRole("heading", { name: nomeA }),
        "o sheet reabriu com o estado do grupo anterior"
      ).toHaveCount(0);
      await expect(page.getByRole("heading", { name: nomeB })).toBeVisible();
      await shot(page, "31-grupos-sheet");
      await page.getByRole("button", { name: "Close" }).click();
    });

    await test.step("sem erro de console ou HTTP inesperado", async () => {
      expect(realConsoleErrors(errorLog), "erros de console na tela de grupos").toEqual([]);
      expect(unexpectedHttp(errorLog), "respostas HTTP com erro").toEqual([]);
    });

    // ── Limpeza ──
    const lista = await api.call<Group[] | { data: Group[] }>("GET", "/small-groups?limit=100");
    const todos = Array.isArray(lista) ? lista : lista.data;
    for (const g of todos) if (g.name === nomeA || g.name === nomeB) criados.push(g.id);
    for (const id of criados) await api.tryCall("DELETE", `/small-groups/${id}`);
  });
});
