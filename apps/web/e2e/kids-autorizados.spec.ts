/**
 * E2E da tela de autorizados da ficha da criança (REV-4.7): adicionar um
 * terceiro autorizado, editar o vínculo e remover, com a regra de que a criança
 * nunca fica sem responsável primário (`GuardianFormModal` + remoção na ficha).
 *
 * Roda em `teste2-church` (Premium — Kids é Premium): `E2E_EMAIL` aponta a
 * conta `fvargaspf+teste2@gmail.com`, nunca `doca-church`. A criança e o
 * responsável nascem pela API só para o teste (`E2E Crianca …`, `E2E Resp …`) e
 * são apagados no fim, junto com o autorizado criado pela tela.
 *
 * Uso: E2E_EMAIL=... E2E_PASSWORD=... npm run e2e -w orbien-web -- kids-autorizados
 */

import { expect, shot, test, type Api } from "./fixtures";

interface Identified {
  id: string;
}

function yearsAgo(years: number): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

async function limpar(api: Api, stamp: number, guardianId: string) {
  const children = await api.call<Array<Identified>>(
    "GET",
    `/kids/children?search=${encodeURIComponent(`E2E Crianca ${stamp}`)}`,
  );
  for (const c of children) await api.tryCall("DELETE", `/persons/${c.id}`);
  // O autorizado criado pela tela vira uma pessoa; busca pelo nome do teste.
  const autorizados = await api.call<{ data: Identified[] }>(
    "GET",
    `/persons?search=${encodeURIComponent(`E2E Autorizado ${stamp}`)}&limit=10`,
  );
  for (const p of autorizados.data ?? []) await api.tryCall("DELETE", `/persons/${p.id}`);
  await api.tryCall("DELETE", `/persons/${guardianId}`);
}

test.describe("autorizados da criança no Kids", () => {
  test("adiciona, edita e remove autorizados sem deixar a criança sem responsável primário", async ({ page, api }) => {
    const stamp = Date.now();
    const respNome = `E2E Resp ${stamp}`;
    const autNome = `E2E Autorizado ${stamp}`;
    const childNome = `E2E Crianca ${stamp}`;
    const { person } = await api.call<{ person: Identified }>("POST", "/persons", {
      full_name: respNome,
      classification: "visitor",
    });
    try {
      const consent = await api.call<{ term_version: string }>("GET", `/kids/consent?guardian_person_id=${person.id}`);
      await api.call("POST", "/kids/consent", { guardian_person_id: person.id, term_version: consent.term_version });
      await api.call("POST", "/kids/children", {
        full_name: childNome,
        birth_date: yearsAgo(4),
        guardian_person_id: person.id,
        relationship: "responsável",
      });

      // Abrir a ficha troca a lista pela ficha. O clique antes da hidratação é
      // engolido, então a retentativa só refaz a busca e o clique enquanto a
      // lista segue na tela (mesmo desenho de `kids-criancas.spec.ts`).
      await page.goto("/kids/criancas", { waitUntil: "domcontentloaded" });
      const busca = page.getByPlaceholder("Buscar criança pelo nome");
      const linha = page.getByRole("row", { name: new RegExp(childNome) });
      const regiao = page.getByRole("region", { name: "Responsáveis" });
      await expect(async () => {
        await expect(busca.or(regiao)).toBeVisible({ timeout: 15_000 });
        if (await regiao.isVisible()) return;
        await busca.fill("");
        await busca.fill(childNome);
        await expect(linha).toBeVisible({ timeout: 5_000 });
        await linha.click({ timeout: 5_000 });
        await expect(regiao).toBeVisible({ timeout: 15_000 });
      }).toPass({ timeout: 120_000 });

      const responsaveis = page.getByRole("region", { name: "Responsáveis" });
      const itemResp = responsaveis.getByRole("listitem").filter({ hasText: respNome });
      const itemAut = responsaveis.getByRole("listitem").filter({ hasText: autNome });
      const regra = /ao menos um responsável primário/;
      await expect(itemResp).toContainText("Primário");

      await test.step("adiciona um terceiro autorizado que pode buscar, sem ser primário", async () => {
        await responsaveis.getByRole("button", { name: "Autorizar uma pessoa" }).click();
        const dialog = page.getByRole("dialog", { name: "Autorizar uma pessoa" });
        await expect(dialog.getByRole("button", { name: "Autorizar pessoa" })).toBeDisabled();
        await dialog.getByLabel("Nome").fill(autNome);
        await dialog.getByLabel("Telefone").fill("11999990000");
        await dialog.getByLabel("Parentesco").fill("avó");
        await dialog.getByRole("button", { name: "Autorizar pessoa" }).click();
        await expect(dialog).toBeHidden();

        await expect(itemAut).toContainText("avó");
        await expect(itemAut).toContainText("Pode buscar");
        await expect(itemAut).not.toContainText("Primário");
        await expect(responsaveis.getByRole("heading", { name: /\(2\)/ })).toBeVisible();
        await shot(page, "kids-autorizados-01-adicionado");
      });

      await test.step("não remove o único responsável primário", async () => {
        await responsaveis.getByRole("button", { name: `Remover ${respNome}` }).click();
        const dialog = page.getByRole("dialog", { name: "Remover este responsável?" });
        await dialog.getByRole("button", { name: "Remover responsável" }).click();
        await expect(dialog.getByRole("alert")).toContainText(regra);
        await dialog.getByRole("button", { name: "Voltar" }).click();
        await expect(dialog).toBeHidden();
        await expect(itemResp).toBeVisible();
        await expect(itemResp).toContainText("Primário");
      });

      await test.step("edita o vínculo: parentesco novo e promoção a primário", async () => {
        await responsaveis.getByRole("button", { name: `Editar ${autNome}` }).click();
        const dialog = page.getByRole("dialog", { name: "Editar responsável" });
        await dialog.getByLabel("Parentesco").fill("tia");
        await dialog.getByLabel(/Responsável primário/).check();
        await dialog.getByRole("button", { name: "Salvar responsável" }).click();
        await expect(dialog).toBeHidden();

        await expect(itemAut).toContainText("tia");
        await expect(itemAut).toContainText("Primário");
        // Promover rebaixa o primário anterior: sempre um só.
        await expect(itemResp).not.toContainText("Primário");
        await shot(page, "kids-autorizados-02-editado");
      });

      await test.step("remove o responsável que deixou de ser primário", async () => {
        await responsaveis.getByRole("button", { name: `Remover ${respNome}` }).click();
        const dialog = page.getByRole("dialog", { name: "Remover este responsável?" });
        await dialog.getByRole("button", { name: "Remover responsável" }).click();
        await expect(dialog).toBeHidden();
        await expect(itemResp).toHaveCount(0);
        await expect(responsaveis.getByRole("heading", { name: /\(1\)/ })).toBeVisible();
      });

      await test.step("o último primário também não sai", async () => {
        await responsaveis.getByRole("button", { name: `Remover ${autNome}` }).click();
        const dialog = page.getByRole("dialog", { name: "Remover este responsável?" });
        await dialog.getByRole("button", { name: "Remover responsável" }).click();
        await expect(dialog.getByRole("alert")).toContainText(regra);
        await dialog.getByRole("button", { name: "Voltar" }).click();
        await expect(itemAut).toBeVisible();
        await shot(page, "kids-autorizados-03-ultimo-primario");
      });
    } finally {
      await limpar(api, stamp, person.id);
    }
  });
});
