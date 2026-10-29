/**
 * E2E do balcão do Kids (KIDS-08/09): check-in com o código, entrega com o
 * código certo e recusa com o errado, mais a saída por exceção do líder.
 *
 * Roda em `teste2-church` (Premium — Kids é Premium): `E2E_EMAIL` aponta a
 * conta `fvargaspf+teste2@gmail.com`, nunca `doca-church`. O dado do teste
 * (turma, criança, culto de hoje, sessão) é montado e desmontado pela API.
 * Turma, sessão e culto saem desativados/cancelados — a API não apaga linha de
 * Kids (histórico), então o resíduo é só isso, com nome `E2E Kids …`.
 *
 * Uso: E2E_EMAIL=... E2E_PASSWORD=... npm run e2e -w orbien-web -- kids-balcao
 */

import { expect, shot, test, type Api, type Page } from "./fixtures";

interface Identified {
  id: string;
}
interface PersonRow extends Identified {
  full_name: string;
}

/** Hoje no dia civil de Brasília, como o balcão calcula. */
function todaySaoPaulo(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function yearsAgo(years: number): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

interface Scenario {
  roomName: string;
  childName: string;
  guardianName: string;
  sessionId: string;
}

/** Turma ampla, culto de hoje, sessão aberta e uma criança com alergia e consentimento. */
async function montarCenario(api: Api, stamp: number): Promise<Scenario & { cleanup: () => Promise<void> }> {
  const roomName = `E2E Kids ${stamp}`;
  const childName = `Criança E2E ${stamp}`;

  const room = await api.call<Identified>("POST", "/kids/rooms", {
    name: roomName,
    min_age_months: 0,
    max_age_months: 1200,
  });

  const celebrations = await api.call<Identified[]>("GET", "/celebrations");
  if (!Array.isArray(celebrations) || celebrations.length === 0) {
    throw new Error("Nenhuma celebração cadastrada — impossível criar o culto de hoje.");
  }
  const instance = await api.call<Identified>("POST", "/celebrations/instances", {
    celebration_id: celebrations[0].id,
    scheduled_date: todaySaoPaulo(),
    notes: "instância temporária de e2e (kids)",
  });
  const [session] = await api.call<Identified[]>("POST", `/celebrations/instances/${instance.id}/kids-sessions`, {
    room_ids: [room.id],
  });

  const persons = await api.call<{ data: PersonRow[] }>("GET", "/persons?limit=5");
  const guardian = persons.data[0];
  if (!guardian) throw new Error("Nenhuma pessoa adulta em teste2-church para ser o responsável.");

  const consent = await api.call<{ term_version: string }>("GET", `/kids/consent?guardian_person_id=${guardian.id}`);
  await api.call("POST", "/kids/consent", { guardian_person_id: guardian.id, term_version: consent.term_version });
  await api.call("POST", "/kids/children", {
    full_name: childName,
    birth_date: yearsAgo(3),
    allergies: "amendoim",
    guardian_person_id: guardian.id,
    relationship: "responsável",
  });

  return {
    roomName,
    childName,
    guardianName: guardian.full_name,
    sessionId: session.id,
    cleanup: async () => {
      await api.tryCall("DELETE", `/kids/sessions/${session.id}`);
      await api.tryCall("DELETE", `/kids/rooms/${room.id}`);
      await api.tryCall("DELETE", `/celebrations/instances/${instance.id}`);
    },
  };
}

async function abrirBalcao(page: Page, roomName: string) {
  await page.goto("/kids", { waitUntil: "domcontentloaded" });
  const tab = page.getByRole("tab", { name: new RegExp(roomName) });
  // Hidratação: o clique antes dela é engolido (ver `selectTab` em fixtures).
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
}

async function fazerCheckin(page: Page, childName: string): Promise<string> {
  await page.getByPlaceholder("Buscar criança pelo nome").fill(childName);
  await page.getByRole("button", { name: `Fazer check-in: ${childName}` }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Alergia: amendoim")).toBeVisible();
  await dialog.getByRole("button", { name: "Fazer check-in" }).click();
  await expect(page.getByRole("dialog", { name: "Check-in feito" })).toBeVisible();
  const label = await page.getByRole("img", { name: /^Código de retirada:/ }).getAttribute("aria-label");
  const code = (label ?? "").replace("Código de retirada:", "").replace(/[, ]/g, "");
  expect(code).toMatch(/^[2-9A-HJKMNP-Z]{4}$/);
  await shot(page, "kids-00-codigo");
  await page.getByRole("button", { name: "Concluir" }).click();
  return code;
}

test.describe("balcão do Kids", () => {
  test("check-in mostra o código, e a entrega só passa com o código certo", async ({ page, api, errorLog }) => {
    const stamp = Date.now();
    const cenario = await montarCenario(api, stamp);
    try {
      await abrirBalcao(page, cenario.roomName);

      let code = "";
      await test.step("check-in: confirma com o código grande e a criança entra no roster com a alergia", async () => {
        code = await fazerCheckin(page, cenario.childName);
        const linha = page.getByRole("row", { name: new RegExp(cenario.childName) });
        await expect(linha).toBeVisible();
        await expect(linha.getByText("Alergia: amendoim")).toBeVisible();
        await expect(page.getByText("Presentes (1)")).toBeVisible();
        // O roster não relê o código.
        await expect(page.getByRole("table")).not.toContainText(code);
        await shot(page, "kids-01-roster");
      });

      await test.step("entrega com o código certo: Criança entregue", async () => {
        await page.getByRole("button", { name: `Entregar criança: ${cenario.childName}` }).click();
        const dialog = page.getByRole("dialog", { name: "Entregar criança" });
        await dialog.getByLabel("Quem está buscando").selectOption({ label: `${cenario.guardianName} (responsável)` });
        await dialog.getByLabel("Código de retirada").fill(code);
        await dialog.getByRole("button", { name: "Entregar criança" }).click();
        await expect(page.getByRole("status")).toContainText(`Criança entregue: ${cenario.childName}`);
        await expect(page.getByText("Nenhuma criança presente")).toBeVisible();
        await shot(page, "kids-02-entregue");
      });

      expect(errorLog.console.filter((e) => !/favicon|Failed to load resource|DevTools/i.test(e))).toEqual([]);
    } finally {
      await cenario.cleanup();
    }
  });

  test("código errado é recusado sem dizer por quê, e o líder fecha por exceção com motivo", async ({ page, api }) => {
    const stamp = Date.now();
    const cenario = await montarCenario(api, stamp);
    try {
      await abrirBalcao(page, cenario.roomName);
      const code = await fazerCheckin(page, cenario.childName);

      await test.step("código que não confere: recusa genérica, criança continua presente", async () => {
        // Outro código válido no alfabeto: troca o primeiro caractere.
        const errado = (code[0] === "2" ? "3" : "2") + code.slice(1);
        await page.getByRole("button", { name: `Entregar criança: ${cenario.childName}` }).click();
        const dialog = page.getByRole("dialog", { name: "Entregar criança" });
        await dialog.getByLabel("Quem está buscando").selectOption({ index: 1 });
        await dialog.getByLabel("Código de retirada").fill(errado);
        await dialog.getByRole("button", { name: "Entregar criança" }).click();

        await expect(dialog.getByRole("alert")).toHaveText("Este código não é de quem está buscando. Chame o líder kids.");
        await shot(page, "kids-03-recusa");
      });

      await test.step("líder autoriza a saída por exceção, com motivo", async () => {
        // O título do diálogo muda ao entrar no modo de exceção: localizar sem nome.
        const dialog = page.getByRole("dialog");
        await dialog.getByRole("button", { name: "Sem o código? Líder autoriza a saída" }).click();
        await expect(page.getByRole("heading", { name: "Líder autoriza a saída" })).toBeVisible();
        await dialog.getByLabel("Quem está buscando").fill("Responsável de teste");
        await dialog.getByLabel("Motivo").fill("e2e: perdeu a etiqueta; conferi o documento");
        await dialog.getByRole("button", { name: "Autorizar saída" }).click();
        await expect(page.getByRole("status")).toContainText(`Criança entregue: ${cenario.childName}`);
        await expect(page.getByText("Nenhuma criança presente")).toBeVisible();
      });
    } finally {
      await cenario.cleanup();
    }
  });

  test("QR da tela do código abre a entrega, e 3 recusas seguidas mandam chamar o líder", async ({ page, api }) => {
    const stamp = Date.now();
    const cenario = await montarCenario(api, stamp);
    try {
      await abrirBalcao(page, cenario.roomName);
      await fazerCheckin(page, cenario.childName);

      const [child] = await api.call<Identified[]>("GET", `/kids/children?search=${encodeURIComponent(cenario.childName)}`);
      const open = await api.call<{ qr: string }>("GET", `/kids/children/${child.id}/checkin`);
      expect(open.qr).toMatch(/^kidsco1\./);

      await test.step("QR adulterado: recusa genérica; na 3ª seguida, orientação e exceção em destaque", async () => {
        const forjado = `${open.qr.slice(0, -2)}xx`;
        for (let i = 1; i <= 3; i++) {
          await page.getByLabel("Ler QR").fill(forjado);
          await page.getByLabel("Ler QR").press("Enter");
          const dialog = page.getByRole("dialog", { name: "Entregar criança" });
          await expect(dialog.getByText("QR lido")).toBeVisible();
          await dialog.getByLabel("Quem está buscando").selectOption({ index: 1 });
          await dialog.getByRole("button", { name: "Entregar criança" }).click();
          await expect(dialog.getByRole("alert")).toHaveText("Este código não é de quem está buscando. Chame o líder kids.");
          if (i < 3) await dialog.getByRole("button", { name: "Cancelar" }).click();
        }
        const dialog = page.getByRole("dialog", { name: "Entregar criança" });
        await expect(dialog.getByText(/3 recusas seguidas/)).toBeVisible();
        await expect(dialog.getByRole("button", { name: "Líder autoriza a saída (sem o código)" })).toBeVisible();
        await shot(page, "kids-04-tres-recusas");
        await dialog.getByRole("button", { name: "Cancelar" }).click();
      });

      await test.step("QR verdadeiro: entrega sem digitar o código", async () => {
        await page.getByLabel("Ler QR").fill(open.qr);
        await page.getByLabel("Ler QR").press("Enter");
        const dialog = page.getByRole("dialog", { name: "Entregar criança" });
        await expect(dialog.getByText("QR lido")).toBeVisible();
        await dialog.getByLabel("Quem está buscando").selectOption({ label: `${cenario.guardianName} (responsável)` });
        await dialog.getByRole("button", { name: "Entregar criança" }).click();
        await expect(page.getByRole("status")).toContainText(`Criança entregue: ${cenario.childName}`);
      });
    } finally {
      await cenario.cleanup();
    }
  });
});
