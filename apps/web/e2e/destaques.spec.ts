/**
 * Aba "Destaques no app" da tela de Conteúdo: escolher quais posts vão para o
 * carrossel da home do mobile e em que ordem (`PUT /content/posts/highlights`).
 *
 * O carrossel é estado compartilhado do tenant, não do teste: esta spec
 * guarda a lista que encontrou e a regrava no fim, dê certo ou não. Como
 * toda spec daqui, roda só em `teste1-church`/`teste2-church` — ver
 * docs/AMBIENTES.md.
 *
 * Uso: E2E_EMAIL=... E2E_PASSWORD=... E2E_TENANT=... npm run e2e -w orbien-web
 */

import { expect, selectTab, shot, test, realConsoleErrors, unexpectedHttp } from "./fixtures";

interface Post {
  id: string;
  title: string;
  app_highlight_position?: number | null;
}

test.describe("destaques no app", () => {
  test("põe posts no carrossel, reordena, salva e a ordem persiste", async ({
    page,
    errorLog,
    api,
  }) => {
    const stamp = Date.now();
    const tituloA = `Destaque A E2E ${stamp}`;
    const tituloB = `Destaque B E2E ${stamp}`;

    const anteriores = (
      await api.call<{ data: Post[] }>("GET", "/content/posts?highlighted=true&limit=10")
    ).data
      .sort((a, b) => (a.app_highlight_position ?? 0) - (b.app_highlight_position ?? 0))
      .map((p) => p.id);

    // Um publicado e um rascunho: o rascunho entra na lista, mas só o
    // publicado sai em `GET /highlights`, que é o que o app lê.
    const postA = await api.call<Post>("POST", "/content/posts", {
      type: "post",
      title: tituloA,
      is_draft: false,
    });
    const postB = await api.call<Post>("POST", "/content/posts", {
      type: "post",
      title: tituloB,
      is_draft: true,
    });

    // Carrossel tem teto de 10; abre espaço para os dois do teste.
    await api.call("PUT", "/content/posts/highlights", { post_ids: anteriores.slice(0, 8) });

    try {
      const destaque = (id: string) => page.getByTestId(`highlight-${id}`);
      const outro = (titulo: string) => page.locator("li", { hasText: titulo });

      await test.step("aba abre com os dois posts fora do carrossel", async () => {
        await page.goto("/conteudo", { waitUntil: "domcontentloaded" });
        await selectTab(page, "Destaques no app");
        await expect(outro(tituloA)).toBeVisible();
        await expect(outro(tituloB)).toContainText("Não publicado");
      });

      await test.step("põe B e depois A, e sobe A para antes de B", async () => {
        await outro(tituloB).getByRole("button", { name: "Pôr em destaque" }).click();
        await outro(tituloA).getByRole("button", { name: "Pôr em destaque" }).click();
        await expect(destaque(postB.id)).toBeVisible();
        await expect(destaque(postA.id)).toBeVisible();

        await destaque(postA.id).getByRole("button", { name: "Subir" }).click();
        await shot(page, "42-conteudo-destaques");
      });

      await test.step("salva e a API devolve a mesma ordem", async () => {
        await page.getByRole("button", { name: "Salvar destaques" }).click();
        await expect(page.getByRole("status")).toContainText("Destaques salvos");

        const ids = (
          await api.call<{ data: Post[] }>("GET", "/content/posts?highlighted=true&limit=10")
        ).data
          .sort((a, b) => (a.app_highlight_position ?? 0) - (b.app_highlight_position ?? 0))
          .map((p) => p.id);
        expect(ids.indexOf(postA.id), "A não ficou antes de B").toBeLessThan(ids.indexOf(postB.id));
        expect(ids.indexOf(postA.id)).toBeGreaterThanOrEqual(0);
      });

      await test.step("o app só vê o publicado", async () => {
        const app = await api.call<Post[]>("GET", "/content/posts/highlights");
        expect(app.map((p) => p.id)).toContain(postA.id);
        expect(app.map((p) => p.id), "rascunho vazou para o app").not.toContain(postB.id);
      });

      await test.step("recarregar mantém a ordem; tirar e salvar remove", async () => {
        await page.reload({ waitUntil: "domcontentloaded" });
        await selectTab(page, "Destaques no app");
        // `evaluateAll` não retenta: sem esperar a lista, lê o "Carregando…".
        await expect(destaque(postA.id)).toBeVisible();
        await expect(destaque(postB.id)).toBeVisible();
        const ordem = await page.getByTestId(/^highlight-/).evaluateAll((els) =>
          els.map((el) => el.getAttribute("data-testid")),
        );
        expect(ordem.indexOf(`highlight-${postA.id}`)).toBeLessThan(
          ordem.indexOf(`highlight-${postB.id}`),
        );

        await destaque(postB.id).getByRole("button", { name: "Tirar do destaque" }).click();
        await page.getByRole("button", { name: "Salvar destaques" }).click();
        await expect(page.getByRole("status")).toContainText("Destaques salvos");
        await expect(destaque(postB.id)).toHaveCount(0);
        await expect(outro(tituloB)).toBeVisible();
      });

      await test.step("sem erro de console ou HTTP inesperado", async () => {
        expect(realConsoleErrors(errorLog), "erros de console na aba de destaques").toEqual([]);
        expect(unexpectedHttp(errorLog), "respostas HTTP com erro").toEqual([]);
      });
    } finally {
      // ── Limpeza: devolve o carrossel como estava e apaga os posts ──
      // `tryCall` não leva corpo; a restauração precisa, e falhar aqui não
      // pode esconder a falha do teste em si.
      await api
        .call("PUT", "/content/posts/highlights", { post_ids: anteriores })
        .catch(() => undefined);
      await api.tryCall("DELETE", `/content/posts/${postA.id}`);
      await api.tryCall("DELETE", `/content/posts/${postB.id}`);
    }
  });
});
