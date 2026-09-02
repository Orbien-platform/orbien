/**
 * Percorre a aba "Templates" em Celebrações: criar pelo formulário, ver na
 * lista, editar e excluir. O template criado aqui é removido pelo próprio
 * teste, pela UI — o que também exercita a exclusão. A fixture `uiTemplateName`
 * é só a rede de segurança para o caso de o teste morrer no meio.
 *
 * Uso: E2E_EMAIL=... E2E_PASSWORD=... E2E_TENANT=... npm run e2e -w orbien-web
 */

import { expect, selectTab, shot, test, realConsoleErrors, unexpectedHttp } from "./fixtures";

test.describe("templates de escala", () => {
  test("cria, edita e exclui um template pela UI", async ({
    page,
    errorLog,
    uiTemplateName: NAME,
  }) => {
    const nameInput = page.locator("#tpl-name");
    const descInput = page.locator("#tpl-desc");
    const card = page.getByText(NAME, { exact: true });

    await test.step("aba Templates abre e oferece 'Novo template'", async () => {
      await page.goto("/celebracoes", { waitUntil: "domcontentloaded" });
      await selectTab(page, "Templates");
      await expect(
        page.getByRole("button", { name: "Novo template" }),
        "aba Templates não renderizou"
      ).toBeVisible();
      await shot(page, "10-templates");
    });

    // ── Criar ──
    await test.step("formulário de template abre", async () => {
      await page.getByRole("button", { name: "Novo template" }).click();
      await expect(nameInput).toBeVisible();
    });

    await nameInput.fill(NAME);
    await descInput.fill("criado pelo teste de e2e");

    const minSelect = page.getByLabel("Ministério 1");

    await test.step("select de ministérios carrega as opções", async () => {
      // O select nasce só com o placeholder e é preenchido quando a lista de
      // ministérios chega; esperar por opções evita confundir carregamento com
      // ausência de dados. O auto-retry do `expect` faz essa espera.
      await expect(
        minSelect.locator("option").nth(1),
        "select de ministérios não foi preenchido"
      ).toBeAttached();
    });

    await minSelect.selectOption({ index: 1 });
    await page.getByLabel("Vagas 1").fill("3");

    await test.step("formulário barra criação sem nome", async () => {
      // Validação: nome vazio deve barrar antes de chamar a API.
      await nameInput.fill("");
      await page.getByRole("button", { name: "Criar", exact: true }).click();
      await expect(
        page.getByText("Dê um nome ao template."),
        "formulário não validou nome vazio"
      ).toBeVisible({ timeout: 10_000 });
    });

    await nameInput.fill(NAME);
    await shot(page, "11-form-template");

    await test.step("template criado aparece na lista", async () => {
      await page.getByRole("button", { name: "Criar", exact: true }).click();
      await expect(card, "template não apareceu na lista após criar").toBeVisible();
      await shot(page, "12-template-criado");
    });

    // ── Regressão visual ──
    await test.step("botões de ícone não têm fundo preenchido", async () => {
      // O componente Button tem variant "default" com fundo preenchido. Usá-lo
      // para botão de ícone sem classe de fundo pinta um quadrado escuro, que
      // foi exatamente o que aconteceu aqui — a base usa <button> puro nesses
      // casos.
      //
      // O ponteiro sai de cima antes de medir: esses botões têm `hover:bg-*`,
      // e o cursor parado sobre um deles pintaria um fundo legítimo, dando
      // falso positivo.
      await page.mouse.move(0, 0);
      await expect(
        page.getByRole("button", { name: `Excluir ${NAME}` }),
        "botão de ícone com fundo preenchido — variant default do Button?"
      ).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    });

    // ── Editar ──
    await test.step("edição do template reflete na lista", async () => {
      await page.getByRole("button", { name: `Editar ${NAME}` }).click();
      await expect(descInput).toBeVisible();
      await descInput.fill("descrição editada");
      await page.getByRole("button", { name: "Salvar", exact: true }).click();
      await expect(
        page.getByText("descrição editada", { exact: true }),
        "edição não refletiu na lista"
      ).toBeVisible();
    });

    // ── Excluir ──
    await test.step("template excluído sai da lista", async () => {
      await page.getByRole("button", { name: `Excluir ${NAME}` }).click();
      await expect(card, "template continua na lista após excluir").toHaveCount(0);
    });

    // ── Erros ──
    await test.step("nenhuma resposta de erro inesperada", async () => {
      expect(unexpectedHttp(errorLog).join(" | ")).toBe("");
    });

    await test.step("nenhum erro de JavaScript", async () => {
      expect(realConsoleErrors(errorLog).join(" | ")).toBe("");
    });
  });
});
