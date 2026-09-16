/**
 * Cobertura E2E do CRUD de redes de células (PROD-20, CEL20-07): criar,
 * editar e vincular/desvincular célula pela tela `/redes`.
 *
 * Só havia teste de componente (`NetworkFormModal.test.tsx`,
 * `redes/page.test.tsx`) e do backend. Ver PEND-05 em docs/PLANO.md.
 *
 * Uso: E2E_EMAIL=... E2E_PASSWORD=... E2E_TENANT=... npm run e2e -w orbien-web
 */

import { expect, shot, test, realConsoleErrors, unexpectedHttp } from "./fixtures";

interface Group { id: string; name: string }
interface Network { id: string; name: string }

test.describe("redes", () => {
  test("cria, edita e vincula/desvincula célula", async ({ page, errorLog, api }) => {
    const stamp = Date.now();
    const nomeRede = `Rede E2E ${stamp}`;
    const nomeRedeEditada = `${nomeRede} (editada)`;
    const nomeCelula = `Célula p/ Rede E2E ${stamp}`;
    let groupId: string | undefined;

    await test.step("cria célula sem rede via API, para vincular depois", async () => {
      const criada = await api.call<Group>("POST", "/small-groups", {
        name: nomeCelula,
        type: "cell",
      });
      groupId = criada.id;
    });

    await test.step("cria a rede pela UI", async () => {
      await page.goto("/redes", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Nova rede" }).click();
      await page.getByPlaceholder("ex: Rede Zona Sul").fill(nomeRede);
      await page.getByPlaceholder("ex: 80").fill("70");
      await page.getByRole("button", { name: "Salvar" }).click();
      await expect(page.getByRole("cell", { name: nomeRede })).toBeVisible();
      await shot(page, "50-redes-lista");
    });

    await test.step("edita o nome da rede", async () => {
      await page
        .getByRole("row", { name: new RegExp(nomeRede) })
        .getByRole("button", { name: "Editar rede" })
        .click();
      const nomeInput = page.getByPlaceholder("ex: Rede Zona Sul");
      await nomeInput.fill(nomeRedeEditada);
      await page.getByRole("button", { name: "Salvar" }).click();
      await expect(page.getByRole("cell", { name: nomeRedeEditada })).toBeVisible();
    });

    await test.step("vincula a célula sem rede", async () => {
      await page
        .getByRole("row", { name: new RegExp(nomeRedeEditada) })
        .getByRole("button", { name: "Gerenciar células" })
        .click();
      await expect(page.getByRole("heading", { name: `Células de ${nomeRedeEditada}` })).toBeVisible();
      await page
        .getByLabel("Selecione uma célula sem rede")
        .selectOption({ label: nomeCelula });
      await page.getByRole("button", { name: "Vincular" }).click();
      await expect(page.getByText(nomeCelula)).toBeVisible();
      await shot(page, "51-redes-celula-vinculada");
    });

    await test.step("desvincula a célula", async () => {
      await page.getByRole("button", { name: `Desvincular ${nomeCelula}` }).click();
      await expect(page.getByText("Nenhuma célula vinculada.")).toBeVisible();
      await page.getByRole("button", { name: "Close" }).click();
    });

    await test.step("sem erro de console ou HTTP inesperado", async () => {
      expect(realConsoleErrors(errorLog), "erros de console na tela de redes").toEqual([]);
      expect(unexpectedHttp(errorLog), "respostas HTTP com erro").toEqual([]);
    });

    // ── Limpeza ──
    const redes = await api.call<Network[]>("GET", "/networks");
    const networkId = redes.find((n) => n.name === nomeRedeEditada || n.name === nomeRede)?.id;
    if (networkId) await api.tryCall("DELETE", `/networks/${networkId}`);
    if (groupId) await api.tryCall("DELETE", `/small-groups/${groupId}`);
  });
});
