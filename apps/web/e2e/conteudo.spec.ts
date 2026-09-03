/**
 * Cobertura permanente da tela de Conteúdo.
 *
 * Mesma motivação das specs de pessoas e grupos: o `c84fc02` reescreveu os
 * effects desta tela e do `PostDetailSheet`, e a verificação da época foi
 * manual. Ver a pendência nº 4 de docs/PENDENCIAS.md.
 *
 *   #1 reset de sheet no fechamento
 *   #2 recarga após mutação incrementa um tick em vez de aguardar o load
 *   #5 criar registro passou de 2 fetches para 1
 *
 * A busca por texto não existe aqui — o filtro é por tipo e status, em selects.
 * Por isso esta spec não cobre o cancelamento (#3/#4): quem cobre são as
 * specs de pessoas e grupos, onde a busca é server-side e dá para disparar
 * duas requisições em voo.
 *
 * Uso: E2E_EMAIL=... E2E_PASSWORD=... E2E_TENANT=... npm run e2e -w orbien-web
 */

import { expect, shot, test, realConsoleErrors, unexpectedHttp } from "./fixtures";

interface Post { id: string; title: string }

test.describe("conteúdo", () => {
  test("cria posts, filtra por status e reabre o sheet", async ({ page, errorLog, api }) => {
    const stamp = Date.now();
    const rascunho = `Rascunho E2E ${stamp}`;
    const publicado = `Publicado E2E ${stamp}`;
    const statusFilter = page.locator("select").nth(1);

    // O rótulo do botão de submit acompanha o modo escolhido — "Salvar
    // rascunho" ou "Publicar" —, então ele vem junto do modo.
    async function criarPelaUI(
      titulo: string,
      modo: "Rascunho" | "Agora",
      submit: "Salvar rascunho" | "Publicar"
    ) {
      await page.getByRole("button", { name: "Novo post" }).click();
      await page.getByPlaceholder("Título do post").fill(titulo);
      await page.getByPlaceholder("Conteúdo do post…").fill("corpo criado pelo teste de e2e");
      await page.getByRole("button", { name: modo, exact: true }).click();
      await page.getByRole("button", { name: submit, exact: true }).click();
    }

    await test.step("aba Posts abre", async () => {
      await page.goto("/conteudo", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("button", { name: "Novo post" })).toBeVisible();
      await shot(page, "40-conteudo-lista");
    });

    await test.step("#5 post criado aparece na tabela sem recarregar", async () => {
      await criarPelaUI(rascunho, "Rascunho", "Salvar rascunho");
      await expect(
        page.getByRole("cell", { name: rascunho }),
        "o post criado não apareceu na tabela"
      ).toBeVisible();
    });

    await test.step("segundo post, publicado", async () => {
      await criarPelaUI(publicado, "Agora", "Publicar");
      await expect(page.getByRole("cell", { name: publicado })).toBeVisible();
    });

    await test.step("#2 filtro de status recarrega a lista", async () => {
      await statusFilter.selectOption("draft");
      await expect(page.getByRole("cell", { name: rascunho })).toBeVisible();
      await expect(
        page.getByRole("cell", { name: publicado }),
        "o filtro de rascunhos mostrou um post publicado"
      ).toHaveCount(0);

      await statusFilter.selectOption("published");
      await expect(page.getByRole("cell", { name: publicado })).toBeVisible();
      await expect(
        page.getByRole("cell", { name: rascunho }),
        "o filtro de publicados mostrou um rascunho"
      ).toHaveCount(0);

      await statusFilter.selectOption("");
      await expect(page.getByRole("cell", { name: rascunho })).toBeVisible();
    });

    await test.step("#1 sheet reabre limpo em outro post", async () => {
      await page.getByRole("cell", { name: rascunho }).click();
      await expect(page.getByRole("heading", { name: rascunho })).toBeVisible();
      await page.getByRole("button", { name: "Close" }).click();
      await expect(page.getByRole("heading", { name: rascunho })).toHaveCount(0);

      await page.getByRole("cell", { name: publicado }).click();
      await expect(
        page.getByRole("heading", { name: rascunho }),
        "o sheet reabriu com o estado do post anterior"
      ).toHaveCount(0);
      await expect(page.getByRole("heading", { name: publicado })).toBeVisible();
      await shot(page, "41-conteudo-sheet");
      await page.getByRole("button", { name: "Close" }).click();
    });

    await test.step("sem erro de console ou HTTP inesperado", async () => {
      expect(realConsoleErrors(errorLog), "erros de console na tela de conteúdo").toEqual([]);
      expect(unexpectedHttp(errorLog), "respostas HTTP com erro").toEqual([]);
    });

    // ── Limpeza ──
    const lista = await api.call<{ data: Post[] }>("GET", "/content/posts?limit=100");
    for (const p of lista.data) {
      if (p.title === rascunho || p.title === publicado) {
        await api.tryCall("DELETE", `/content/posts/${p.id}`);
      }
    }
  });
});
