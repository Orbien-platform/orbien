/**
 * E2E do modelo de turmas e das sessões kids de um culto (REV-4.7): definir o
 * modelo na celebração, abrir a turma no culto e cancelar a sessão. O segundo
 * teste cobre o ciclo da REV-4.2: cancelar a instância fecha as sessões,
 * reativar o culto não as reabre, e o "Reabrir" da sessão a traz de volta.
 *
 * O "Reabrir" ficou de fora enquanto a rota e o botão não estavam no ambiente
 * publicado (o job `e2e-prod` roda esta suíte contra ele); já estão, desde o
 * deploy de `abdce8f`.
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
  // A avulsa já nasce com a instância; se não, cria. Lê do mesmo endpoint que a
  // ficha usa: ler de outro lugar e criar "por garantia" deixava duas instâncias.
  const existing = await api.call<Identified[]>(
    "GET",
    `/celebrations/instances?celebration_id=${celebration.id}`,
  );
  let instanceId = existing[0]?.id;
  if (!instanceId) {
    const created = await api.call<Identified>("POST", "/celebrations/instances", {
      celebration_id: celebration.id,
      scheduled_date: daysAhead(45),
    });
    instanceId = created.id;
  }
  return {
    roomId: room.id,
    instanceId,
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
  test("define o modelo, abre a turma no culto e cancela a sessão", async ({ page, api }) => {
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

      await test.step("cancela a sessão: marca como cancelada e tira o botão de cancelar", async () => {
        await sessoes.getByRole("button", { name: `Cancelar a sessão ${cenario.roomName}` }).click();
        await expect(sessoes.getByText("Cancelada")).toBeVisible();
        await expect(sessoes.getByRole("button", { name: `Cancelar a sessão ${cenario.roomName}` })).toHaveCount(0);
        await shot(page, "kids-modelo-02-sessao-cancelada");
      });
    } finally {
      await cenario.cleanup();
    }
  });

  test("cancela o culto, reativa e reabre a sessão kids", async ({ page, api }) => {
    const stamp = Date.now();
    const cenario = await montarCenario(api, stamp);
    try {
      await api.call("POST", `/celebrations/instances/${cenario.instanceId}/kids-sessions`, {
        room_ids: [cenario.roomId],
      });
      await abrirCelebracao(page, cenario.celebrationName);

      const botaoCulto = (acao: "Cancelar" | "Reabrir") =>
        page.getByRole("button", { name: new RegExp(`^${acao} o culto de`) });
      const botaoKids = page.getByRole("button", { name: /^Turmas kids do culto de/ });
      const sessoes = page.getByRole("dialog", { name: "Turmas kids do culto" });

      await test.step("cancela o culto: o botão das turmas kids some", async () => {
        await botaoCulto("Cancelar").first().click();
        await page.getByRole("button", { name: "Cancelar culto", exact: true }).click();
        await expect(botaoCulto("Reabrir").first()).toBeVisible();
        await expect(botaoKids).toHaveCount(0);
      });

      await test.step("reativa o culto: a sessão segue cancelada", async () => {
        await botaoCulto("Reabrir").first().click();
        await expect(botaoCulto("Cancelar").first()).toBeVisible();
        // O clique logo após a troca de estado pode ser engolido: retenta até o modal abrir.
        await expect(async () => {
          await botaoKids.first().click();
          await expect(sessoes).toBeVisible({ timeout: 3_000 });
        }).toPass({ timeout: 60_000 });
        await expect(sessoes.getByText("Cancelada")).toBeVisible();
        await shot(page, "kids-modelo-03-sessao-cancelada-pelo-culto");
      });

      await test.step("reabre a sessão", async () => {
        await sessoes.getByRole("button", { name: `Reabrir a sessão ${cenario.roomName}` }).click();
        await expect(sessoes.getByRole("button", { name: `Cancelar a sessão ${cenario.roomName}` })).toBeVisible();
        await expect(sessoes.getByText("Cancelada")).toHaveCount(0);
        await shot(page, "kids-modelo-04-sessao-reaberta");
      });
    } finally {
      await cenario.cleanup();
    }
  });
});
