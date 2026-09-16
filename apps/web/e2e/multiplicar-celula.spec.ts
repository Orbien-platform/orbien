/**
 * Cobertura E2E do wizard de multiplicar célula (PROD-20, CEL20-01).
 *
 * Faltava cobertura ponta a ponta desse fluxo — só havia teste de componente
 * (`MultiplyGroupModal.test.tsx`) e do backend. Ver PEND-05 em docs/PLANO.md.
 *
 * Uso: E2E_EMAIL=... E2E_PASSWORD=... E2E_TENANT=... npm run e2e -w orbien-web
 */

import { expect, shot, test, realConsoleErrors, unexpectedHttp } from "./fixtures";

interface Group { id: string; name: string }

test.describe("multiplicar célula", () => {
  test("cria célula filha pelo wizard e ela aparece no sheet da mãe", async ({
    page,
    errorLog,
    api,
  }) => {
    const stamp = Date.now();
    const nomeMae = `Célula Mãe E2E ${stamp}`;
    const nomeFilha = `Célula Filha E2E ${stamp}`;
    const criados: string[] = [];

    await test.step("cria a célula mãe pela UI", async () => {
      await page.goto("/grupos", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Novo grupo" }).click();
      await page.getByPlaceholder("ex: Célula Alfa").fill(nomeMae);
      await page.locator("#cg-type").click();
      await page.getByRole("option", { name: "Célula", exact: true }).click();
      await page.locator("#cg-leader").selectOption({ index: 1 });
      await page.getByRole("button", { name: "Criar grupo" }).click();
      await expect(page.getByRole("cell", { name: nomeMae })).toBeVisible();
    });

    await test.step("abre o sheet e o wizard de multiplicar", async () => {
      await page.getByRole("cell", { name: nomeMae }).click();
      await expect(page.getByRole("heading", { name: nomeMae })).toBeVisible();
      await page.getByRole("button", { name: "Multiplicar célula" }).click();
      await expect(page.getByRole("heading", { name: "Multiplicar célula" })).toBeVisible();
      await shot(page, "40-multiplicar-wizard");
    });

    await test.step("preenche nome + novo líder e confirma", async () => {
      await page.getByPlaceholder("ex: Célula Alfa 2").fill(nomeFilha);
      await page.locator("#mg-leader").selectOption({ index: 1 });
      await page.getByRole("button", { name: "Multiplicar" }).click();
      await expect(page.getByText("Célula multiplicada com sucesso!")).toBeVisible();
    });

    await test.step("célula filha aparece na lista de células filhas da mãe", async () => {
      // `getByText` sozinho bateria em 2 lugares: a lista de "Células
      // filhas" do sheet E a linha nova na tabela de grupos por trás dele
      // (onMultiplied recarrega as duas). `getByRole("listitem")` não serve
      // de escopo aqui — o Tailwind preflight zera `list-style` do `<ul>`, o
      // que faz o Chromium remover o papel ARIA de lista/item do `<li>` real
      // (a própria árvore de acessibilidade, não o snapshot do Playwright,
      // que usa outro algoritmo e continua "vendo" o papel). `li` como
      // seletor de tag ignora ARIA e escopa pelo DOM de verdade.
      await expect(
        page.locator("li").filter({ hasText: nomeFilha }),
        "a célula filha não apareceu na lista de células filhas do sheet"
      ).toBeVisible();
      await shot(page, "41-multiplicar-filha-listada");
    });

    await test.step("sem erro de console ou HTTP inesperado", async () => {
      expect(realConsoleErrors(errorLog), "erros de console ao multiplicar célula").toEqual([]);
      expect(unexpectedHttp(errorLog), "respostas HTTP com erro").toEqual([]);
    });

    // ── Limpeza ──
    const lista = await api.call<Group[] | { data: Group[] }>("GET", "/small-groups?limit=100");
    const todos = Array.isArray(lista) ? lista : lista.data;
    for (const g of todos) if (g.name === nomeMae || g.name === nomeFilha) criados.push(g.id);
    // Filha primeiro: apagar a mãe com filha viva não é o caso que este teste
    // exercita, e a ordem evita depender de comportamento de cascade.
    const porNome = (nome: string) => todos.find((g) => g.name === nome)?.id;
    const filhaId = porNome(nomeFilha);
    const maeId = porNome(nomeMae);
    if (filhaId) await api.tryCall("DELETE", `/small-groups/${filhaId}`);
    if (maeId) await api.tryCall("DELETE", `/small-groups/${maeId}`);
  });
});
