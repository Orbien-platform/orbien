/**
 * E2E das turmas do Kids (REV-4.7): criar, editar, desativar e reativar pela
 * tela de escrita (/kids/turmas).
 *
 * Roda em `teste2-church` (Premium — Kids é Premium): `E2E_EMAIL` aponta a
 * conta `fvargaspf+teste2@gmail.com`, nunca `doca-church`. A API não apaga turma
 * (histórico); a limpeza desativa as de nome `E2E Turma …`, que é o resíduo.
 *
 * Uso: E2E_EMAIL=... E2E_PASSWORD=... npm run e2e -w orbien-web -- kids-turmas
 */

import { expect, shot, test, type Page } from "./fixtures";

interface RoomRow {
  id: string;
  name: string;
}

/** Abre o modal de nova turma; o clique antes da hidratação é engolido, então retenta. */
async function abrirNovaTurma(page: Page) {
  await page.goto("/kids/turmas", { waitUntil: "domcontentloaded" });
  const botao = page.getByRole("button", { name: "Nova turma" });
  await expect(async () => {
    await botao.click();
    await expect(page.getByRole("dialog", { name: "Nova turma" })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
}

test.describe("turmas do Kids", () => {
  test("cria, edita, desativa e reativa uma turma", async ({ page, api }) => {
    const stamp = Date.now();
    const nome = `E2E Turma ${stamp}`;
    const nomeEditado = `E2E Turma editada ${stamp}`;

    try {
      await test.step("cria a turma com faixa etária em anos", async () => {
        await abrirNovaTurma(page);
        const dialog = page.getByRole("dialog", { name: "Nova turma" });
        await dialog.getByLabel("Nome da turma").fill(nome);
        await dialog.getByLabel("De (anos)").fill("0");
        await dialog.getByLabel("Até (anos)").fill("3");
        await shot(page, "kids-turmas-00-form");
        await dialog.getByRole("button", { name: "Criar turma" }).click();

        await expect(dialog).toBeHidden();
        await expect(page.getByText(nome, { exact: true })).toBeVisible();
        await shot(page, "kids-turmas-01-criada");
      });

      await test.step("edita o nome", async () => {
        await page.getByRole("button", { name: `Editar a turma ${nome}` }).click();
        const dialog = page.getByRole("dialog", { name: "Editar turma" });
        await expect(dialog.getByLabel("Nome da turma")).toHaveValue(nome);
        await dialog.getByLabel("Nome da turma").fill(nomeEditado);
        await dialog.getByRole("button", { name: "Salvar turma" }).click();

        await expect(dialog).toBeHidden();
        await expect(page.getByText(nomeEditado, { exact: true })).toBeVisible();
        await expect(page.getByText(nome, { exact: true })).toHaveCount(0);
      });

      await test.step("desativa: some da lista padrão e volta com 'Mostrar desativadas'", async () => {
        await page.getByRole("button", { name: `Desativar a turma ${nomeEditado}` }).click();
        const dialog = page.getByRole("dialog", { name: "Desativar esta turma?" });
        await dialog.getByRole("button", { name: "Desativar turma" }).click();

        await expect(dialog).toBeHidden();
        await expect(page.getByText(nomeEditado, { exact: true })).toHaveCount(0);

        await page.getByLabel("Mostrar desativadas").check();
        await expect(page.getByText(nomeEditado, { exact: true })).toBeVisible();
        await shot(page, "kids-turmas-02-desativada");
      });

      await test.step("reativa", async () => {
        await page.getByRole("button", { name: `Reativar a turma ${nomeEditado}` }).click();
        await expect(page.getByRole("button", { name: `Desativar a turma ${nomeEditado}` })).toBeVisible();
      });
    } finally {
      const rooms = await api.call<RoomRow[]>("GET", "/kids/rooms?include_inactive=true");
      for (const r of rooms.filter((x) => x.name.includes(`${stamp}`))) await api.tryCall("DELETE", `/kids/rooms/${r.id}`);
    }
  });

  test("não deixa criar turma sem faixa etária", async ({ page }) => {
    await abrirNovaTurma(page);
    const dialog = page.getByRole("dialog", { name: "Nova turma" });
    await dialog.getByLabel("Nome da turma").fill(`E2E Turma sem faixa ${Date.now()}`);
    await expect(dialog.getByRole("button", { name: "Criar turma" })).toBeDisabled();
  });
});
