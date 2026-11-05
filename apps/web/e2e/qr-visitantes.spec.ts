/**
 * QR de autocadastro de visitante (PEND-19): criar, renomear, desativar e ver
 * o efeito na página pública. Roda só no tenant de teste que o portão usa
 * (`teste2-church`) — `doca-church` nunca. O QR criado aqui é desativado no
 * fim; a API não tem exclusão, então o rótulo leva `E2E` para ser reconhecível.
 *
 * Uso: E2E_EMAIL=... E2E_PASSWORD=... E2E_TENANT=teste2-church npm run e2e -w orbien-web
 */

import { expect, test, realConsoleErrors, unexpectedHttp } from "./fixtures";

interface QrRow {
  id: string;
  token: string;
  label: string | null;
  is_active: boolean;
}

test.describe("qr de visitantes", () => {
  test("cria, renomeia, abre a página pública e desativa", async ({ page, errorLog, api, browser }) => {
    const nome = `QR E2E ${Date.now()}`;
    const renomeado = `${nome} renomeado`;
    let criado: QrRow | null = null;

    try {
      await test.step("a tela abre pelo menu", async () => {
        await page.goto("/pessoas/qr-visitantes", { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { name: "QR de visitantes" })).toBeVisible();
      });

      await test.step("cria um QR de evento", async () => {
        await page.getByRole("button", { name: /Novo QR/ }).click();
        await page.getByLabel("Onde ele vai ficar").selectOption("event");
        await page.getByLabel("Nome (opcional)").fill(nome);
        await page.getByRole("button", { name: "Criar QR" }).click();
        await expect(page.getByText(nome, { exact: true })).toBeVisible();
        const lista = await api.call<QrRow[]>("GET", "/admin/visitor/qr");
        criado = lista.find((q) => q.label === nome) ?? null;
        expect(criado, "o QR criado não apareceu na API").not.toBeNull();
      });

      await test.step("renomeia", async () => {
        await page.getByRole("button", { name: `Renomear ${nome}` }).click();
        await page.getByLabel("Nome", { exact: true }).fill(renomeado);
        await page.getByRole("button", { name: "Salvar nome" }).click();
        await expect(page.getByText(renomeado, { exact: true })).toBeVisible();
      });

      const base = new URL(page.url()).origin;

      await test.step("a página pública abre com o QR ativo", async () => {
        const anon = await browser.newContext();
        const pub = await anon.newPage();
        await pub.goto(`${base}/visitante/teste2-church/${criado!.token}`, { waitUntil: "domcontentloaded" });
        await expect(pub.getByText(renomeado)).toBeVisible();
        await anon.close();
      });

      await test.step("desativa e a página pública recusa", async () => {
        await page.getByRole("button", { name: `Desativar ${renomeado}` }).click();
        // Na linha do QR criado aqui: o tenant de teste acumula QRs desativados
        // de rodadas anteriores (a API não exclui), então o texto solto casa vários.
        await expect(page.getByRole("row", { name: new RegExp(renomeado) }).getByText("Desativado")).toBeVisible();
        const anon = await browser.newContext();
        const pub = await anon.newPage();
        await pub.goto(`${base}/visitante/teste2-church/${criado!.token}`, { waitUntil: "domcontentloaded" });
        await expect(pub.getByRole("heading", { name: "Este QR não está mais ativo" })).toBeVisible();
        await anon.close();
      });
    } finally {
      if (criado) {
        // Best-effort: se o teste já desativou, o PATCH repete o mesmo estado.
        await api
          .call("PATCH", `/admin/visitor/qr/${(criado as QrRow).id}`, { is_active: false })
          .catch(() => undefined);
      }
    }

    expect(realConsoleErrors(errorLog), "erro de console").toEqual([]);
    expect(unexpectedHttp(errorLog), "resposta HTTP inesperada").toEqual([]);
  });
});
