/**
 * E2E das crianças e do consentimento no admin do Kids (REV-4.7): cadastrar a
 * criança com o responsável e o aceite do termo em nome dele, editar a criança,
 * revogar e registrar o consentimento de novo, pela ficha.
 *
 * Roda em `teste2-church` (Premium — Kids é Premium): `E2E_EMAIL` aponta a
 * conta `fvargaspf+teste2@gmail.com`, nunca `doca-church`. O responsável é uma
 * pessoa criada pela API só para o teste (`E2E Resp …`), apagada no fim junto
 * com a criança, para não empurrar a lista de Pessoas.
 *
 * Uso: E2E_EMAIL=... E2E_PASSWORD=... npm run e2e -w orbien-web -- kids-criancas
 */

import { expect, shot, test, type Api, type Page } from "./fixtures";

interface Identified {
  id: string;
}

function yearsAgo(years: number): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

async function criarResponsavel(api: Api, stamp: number) {
  const full_name = `E2E Resp ${stamp}`;
  const { person } = await api.call<{ person: Identified }>("POST", "/persons", { full_name, classification: "visitor" });
  expect(person.id, "POST /persons deveria devolver { person: { id } }").toBeTruthy();
  return { id: person.id, full_name };
}

async function limpar(api: Api, stamp: number, guardianId: string) {
  const children = await api.call<Array<Identified & { full_name: string }>>(
    "GET",
    `/kids/children?search=${encodeURIComponent(`E2E Crianca ${stamp}`)}`,
  );
  for (const c of children) await api.tryCall("DELETE", `/persons/${c.id}`);
  await api.tryCall("DELETE", `/persons/${guardianId}`);
}

/** Abre "Nova criança"; o clique antes da hidratação é engolido, então retenta. */
async function abrirNovaCrianca(page: Page) {
  await page.goto("/kids/criancas", { waitUntil: "domcontentloaded" });
  const botao = page.getByRole("button", { name: "Nova criança" });
  await expect(async () => {
    await botao.click();
    await expect(page.getByRole("dialog", { name: "Nova criança" })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
}

test.describe("crianças e consentimento do Kids", () => {
  test("cadastra a criança com o aceite do termo em nome do responsável, edita e confere a ficha", async ({ page, api }) => {
    const stamp = Date.now();
    const guardian = await criarResponsavel(api, stamp);
    const nome = `E2E Crianca ${stamp}`;
    try {
      await test.step("cadastro: busca o responsável, vê o termo e registra o consentimento", async () => {
        await abrirNovaCrianca(page);
        const dialog = page.getByRole("dialog", { name: "Nova criança" });
        await dialog.getByLabel("Nome da criança").fill(nome);
        await dialog.getByLabel("Data de nascimento").fill(yearsAgo(4));
        await dialog.getByLabel("Alergias e restrições").fill("amendoim");

        await dialog.getByPlaceholder("Buscar o responsável pelo nome").fill(guardian.full_name);
        await dialog.getByRole("button", { name: new RegExp(guardian.full_name) }).click();
        await dialog.getByLabel("Parentesco").fill("responsável");

        // Sem o aceite o botão não libera: o consentimento é pré-requisito do cadastro.
        await expect(dialog.getByText("Falta o consentimento do responsável")).toBeVisible();
        await expect(dialog.getByRole("button", { name: "Cadastrar criança" })).toBeDisabled();
        await shot(page, "kids-criancas-00-termo");
        await dialog.getByLabel(/O responsável leu e aceitou o termo/).check();
        await dialog.getByRole("button", { name: "Cadastrar criança" }).click();

        await expect(dialog).toBeHidden();
      });

      await test.step("a ficha abre com o responsável principal e o consentimento vigente", async () => {
        await expect(page.getByText(nome, { exact: true }).first()).toBeVisible();
        const responsaveis = page.getByRole("region", { name: "Responsáveis" });
        await expect(responsaveis.getByText(guardian.full_name)).toBeVisible();
        const consentimento = page.getByRole("region", { name: "Consentimento" });
        await expect(consentimento.getByText(/consentiu com o termo/)).toBeVisible();
        await shot(page, "kids-criancas-01-ficha");
      });

      await test.step("edita a criança: a alergia aparece na saúde", async () => {
        await page.getByRole("button", { name: "Editar criança" }).click();
        const dialog = page.getByRole("dialog", { name: "Editar criança" });
        await dialog.getByLabel("Alergias e restrições").fill("amendoim e lactose");
        await dialog.getByRole("button", { name: "Salvar criança" }).click();
        await expect(dialog).toBeHidden();
        await expect(page.getByRole("region", { name: "Saúde" })).toContainText("amendoim e lactose");
      });
    } finally {
      await limpar(api, stamp, guardian.id);
    }
  });

  test("revoga o consentimento e registra de novo pela ficha", async ({ page, api }) => {
    const stamp = Date.now();
    const guardian = await criarResponsavel(api, stamp);
    const nome = `E2E Crianca ${stamp}`;
    try {
      const consent = await api.call<{ term_version: string }>("GET", `/kids/consent?guardian_person_id=${guardian.id}`);
      await api.call("POST", "/kids/consent", { guardian_person_id: guardian.id, term_version: consent.term_version });
      await api.call("POST", "/kids/children", {
        full_name: nome,
        birth_date: yearsAgo(4),
        guardian_person_id: guardian.id,
        relationship: "responsável",
      });

      await page.goto("/kids/criancas", { waitUntil: "domcontentloaded" });
      const busca = page.getByPlaceholder("Buscar criança pelo nome");
      const linha = page.getByRole("row", { name: new RegExp(nome) });
      // Em produção (mais lenta) a lista é reconstruída depois do primeiro
      // render: o texto digitado antes da hidratação é descartado (ver
      // `selectTab` em fixtures) e uma linha já visível pode sumir antes do
      // clique. Por isso buscar, ver a linha e abrir a ficha são UMA retentativa:
      // se qualquer passo perde a corrida, a volta seguinte refaz a busca do zero.
      await expect(async () => {
        await busca.fill("");
        await busca.fill(nome);
        await expect(linha).toBeVisible({ timeout: 5_000 });
        await linha.click({ timeout: 5_000 });
        await expect(page.getByRole("region", { name: "Consentimento" })).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 90_000 });

      const consentimento = page.getByRole("region", { name: "Consentimento" });
      await expect(consentimento.getByText(/consentiu com o termo/)).toBeVisible();

      await test.step("revoga: sem consentimento não há check-in", async () => {
        await consentimento.getByRole("button", { name: "Revogar consentimento" }).click();
        const dialog = page.getByRole("dialog", { name: "Revogar o consentimento?" });
        await dialog.getByRole("button", { name: "Revogar consentimento" }).click();
        await expect(dialog).toBeHidden();
        await expect(consentimento.getByText(/ainda não consentiu/)).toBeVisible();
        await shot(page, "kids-criancas-02-revogado");
      });

      await test.step("registra de novo, só depois de marcar que o responsável leu o termo", async () => {
        await consentimento.getByRole("button", { name: "Registrar consentimento" }).click();
        const dialog = page.getByRole("dialog", { name: "Registrar consentimento" });
        await expect(dialog.getByRole("button", { name: "Registrar consentimento" })).toBeDisabled();
        await dialog.getByLabel(/O responsável leu e aceitou o termo/).check();
        await dialog.getByRole("button", { name: "Registrar consentimento" }).click();
        await expect(dialog).toBeHidden();
        await expect(consentimento.getByText(/consentiu com o termo/)).toBeVisible();
      });
    } finally {
      await limpar(api, stamp, guardian.id);
    }
  });
});
