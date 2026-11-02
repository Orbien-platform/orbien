/**
 * E2E do modelo de turmas e das sessões kids de um culto (REV-4.7 e REV-4.2):
 * definir o modelo na celebração, abrir a turma no culto, cancelar a sessão e
 * reabrir.
 *
 * Roda em `teste2-church` (Premium — Kids é Premium): `E2E_EMAIL` aponta a
 * conta `fvargaspf+teste2@gmail.com`, nunca `doca-church`. Celebração e turma
 * são próprias do teste (`E2E Culto Kids …`, `E2E Turma modelo …`). A API não
 * apaga nenhuma das duas: a limpeza as desativa (e a celebração leva junto as
 * instâncias futuras), e o resíduo é só isso, com esses nomes.
 *
 * Uso: E2E_EMAIL=... E2E_PASSWORD=... npm run e2e -w orbien-web -- kids-modelo-sessoes
 */

import { expect, shot, test, type Api, type Page } from "./fixtures";

interface Identified {
  id: string;
}

function daysAhead(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function montarCenario(api: Api, stamp: number) {
  const roomName = `E2E Turma modelo ${stamp}`;
  const celebrationName = `E2E Culto Kids ${stamp}`;
  const room = await api.call<Identified>("POST", "/kids/rooms", {
    name: roomName,
    min_age_months: 0,
    max_age_months: 1200,
  });
  const celebration = await api.call<Identified>("POST", "/celebrations", {
    name: celebrationName,
    type: "sunday_service",
    start_time: "10:00",
    recurrence: "none",
    scheduled_date: daysAhead(45),
  });
  // A avulsa já nasce com a instância; se não, cria.
  const detail = await api.call<{ instances?: Identified[] }>("GET", `/celebrations/${celebration.id}`);
  if (!detail.instances || detail.instances.length === 0) {
    await api.call("POST", "/celebrations/instances", {
      celebration_id: celebration.id,
      scheduled_date: daysAhead(45),
    });
  }
  return {
    roomName,
    celebrationName,
    cleanup: async () => {
      await api.tryCall("DELETE", `/celebrations/${celebration.id}`);
      await api.tryCall("DELETE", `/kids/rooms/${room.id}`);
    },
  };
}

/** Abre a ficha da celebração; o clique antes da hidratação é engolido, então retenta. */
async function abrirCelebracao(page: Page, nome: string) {
  await page.goto("/celebracoes", { waitUntil: "domcontentloaded" });
  const linha = page.getByRole("row", { name: new RegExp(nome) });
  await expect(async () => {
    await linha.click();
    await expect(page.getByRole("region", { name: "Modelo de turmas kids" })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
}

test.describe("modelo e sessões do Kids no culto", () => {
  test("define o modelo, abre a turma no culto, cancela a sessão e reabre", async ({ page, api }) => {
    const stamp = Date.now();
    const cenario = await montarCenario(api, stamp);
    try {
      await abrirCelebracao(page, cenario.celebrationName);
      const modelo = page.getByRole("region", { name: "Modelo de turmas kids" });

      await test.step("sem modelo: convida a definir", async () => {
        await expect(modelo.getByText(/Sem modelo/)).toBeVisible();
      });

      await test.step("define o modelo marcando a turma", async () => {
        await modelo.getByRole("button", { name: "Definir modelo" }).click();
        const dialog = page.getByRole("dialog", { name: "Turmas kids padrão" });
        await dialog.getByRole("checkbox", { name: new RegExp(cenario.roomName) }).check();
        await shot(page, "kids-modelo-00-form");
        await dialog.getByRole("button", { name: "Salvar modelo" }).click();

        await expect(dialog).toBeHidden();
        await expect(modelo.getByText(cenario.roomName)).toBeVisible();
        await expect(modelo.getByRole("button", { name: "Editar modelo" })).toBeVisible();
        await expect(modelo.getByRole("button", { name: "Abrir nas próximas datas" })).toBeVisible();
      });

      await page.getByRole("button", { name: /^Turmas kids do culto de/ }).first().click();
      const sessoes = page.getByRole("dialog", { name: "Turmas kids do culto" });

      await test.step("abre a turma no culto", async () => {
        await expect(sessoes.getByText(/Este culto não tem turma kids/)).toBeVisible();
        await sessoes.getByRole("checkbox", { name: new RegExp(cenario.roomName) }).check();
        await sessoes.getByRole("button", { name: "Abrir turmas" }).click();
        await expect(sessoes.getByRole("button", { name: `Cancelar a sessão ${cenario.roomName}` })).toBeVisible();
        await shot(page, "kids-modelo-01-sessao-aberta");
      });

      await test.step("cancela a sessão: marca como cancelada e oferece reabrir", async () => {
        await sessoes.getByRole("button", { name: `Cancelar a sessão ${cenario.roomName}` }).click();
        await expect(sessoes.getByText("Cancelada")).toBeVisible();
        await expect(sessoes.getByRole("button", { name: `Reabrir a sessão ${cenario.roomName}` })).toBeVisible();
        await shot(page, "kids-modelo-02-sessao-cancelada");
      });

      await test.step("reabre: volta a poder cancelar", async () => {
        await sessoes.getByRole("button", { name: `Reabrir a sessão ${cenario.roomName}` }).click();
        await expect(sessoes.getByRole("button", { name: `Cancelar a sessão ${cenario.roomName}` })).toBeVisible();
        await expect(sessoes.getByText("Cancelada")).toHaveCount(0);
      });
    } finally {
      await cenario.cleanup();
    }
  });
});
