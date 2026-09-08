/**
 * Conexão entre a setlist da Ordem de Celebração e o Repertório: escolher do
 * catálogo com busca, cadastrar a música sem sair da tela, e vincular ao
 * catálogo uma música que foi digitada avulsa.
 *
 * A Ordem de Celebração e a setlist de apoio são montadas por chamada direta à
 * API (mesmo padrão de `repertorio.spec.ts` e das fixtures `upcomingInstance`/
 * `scheduleTemplate`): o que este teste verifica pela tela é o seletor de
 * repertório dentro de "Adicionar música" e a ação de vincular na linha da
 * música — não o modal de criar etapa (`AddItemModal`), que ainda envia campos
 * que a API não aceita (ver docs/PENDENCIAS.md, "A tela de Ordem de
 * Celebração chama rotas/campos que não existem na API").
 *
 * Uso: E2E_EMAIL=... E2E_PASSWORD=... E2E_TENANT=... npm run e2e -w orbien-web
 *
 * **Não executado no ambiente onde foi escrito** (2026-09-08). Três motivos,
 * todos de ambiente e nenhum do teste:
 *   1. o Chromium pré-instalado em `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`
 *      é a revisão `chromium_headless_shell-1194`, e o `@playwright/test`
 *      1.62.1 do repositório procura a `-1234` — `browserType.launch` falha
 *      antes de qualquer fixture;
 *   2. `E2E_EMAIL`/`E2E_PASSWORD`/`E2E_TENANT` não estão definidos, e a
 *      fixture `api` exige as três para o login;
 *   3. não há app em `E2E_BASE_URL` (nem API em `E2E_API_URL`) — o runner não
 *      sobe servidor, por decisão do `playwright.config.ts`.
 * O que foi verificado aqui: `tsc --noEmit` do `apps/web` (que inclui `e2e/`)
 * passa, então tipos, fixtures e helpers usados existem e casam.
 */

import { expect, selectTab, shot, test, type Api, type Page } from "./fixtures";

interface Identified {
  id: string;
}

interface Song extends Identified {
  title: string;
}

/** Etapa de louvor com setlist vazia numa instância futura, montada via API. */
async function setupWorship(api: Api): Promise<{ instanceId: string; setlistId: string; date: Date }> {
  const celebrations = await api.call<Identified[]>("GET", "/celebrations");
  if (celebrations.length === 0) {
    throw new Error("Nenhuma celebração cadastrada — impossível criar instância de teste.");
  }
  const date = new Date();
  date.setDate(date.getDate() + 28);
  const instance = await api.call<Identified>("POST", "/celebrations/instances", {
    celebration_id: celebrations[0].id,
    scheduled_date: date.toISOString().slice(0, 10),
    notes: "instância temporária de e2e — setlist × repertório",
  });
  const serviceOrder = await api.call<Identified>("POST", "/celebrations/orders", {
    celebration_instance_id: instance.id,
    title: "OC de teste — setlist × repertório",
  });
  const item = await api.call<Identified>("POST", "/celebrations/items", {
    service_order_id: serviceOrder.id,
    sequence: 1,
    name: "Momento de louvor",
    type: "worship",
    start_offset_minutes: 0,
    duration_minutes: 20,
    responsible_type: "free_text",
    responsible_label: "Time de louvor",
  });
  const setlist = await api.call<Identified>("POST", "/celebrations/setlists", {
    service_order_item_id: item.id,
  });
  return { instanceId: instance.id, setlistId: setlist.id, date };
}

/** Abre a Ordem de Celebração da instância pela aba "Próximas". */
async function openServiceOrder(page: Page, date: Date): Promise<void> {
  await page.goto("/celebracoes", { waitUntil: "domcontentloaded" });
  await selectTab(page, "Próximas");
  const row = page
    .getByRole("button")
    .filter({ hasText: date.toLocaleDateString("pt-BR") })
    .first();
  await expect(row, "instância criada via API não apareceu na aba Próximas").toBeVisible();
  await row.click();
  await expect(page.getByText("Momento de louvor")).toBeVisible();
}

/** Remove a música do catálogo pelo título (o id do cadastro pela UI é desconhecido). */
async function deleteSongByTitle(api: Api, title: string): Promise<void> {
  try {
    const catalog = await api.call<Song[]>("GET", "/songs");
    const found = catalog.find((s) => s.title === title);
    if (found) await api.tryCall("DELETE", `/songs/${found.id}`);
  } catch {
    // Limpeza best-effort: falhar aqui esconderia o resultado real do teste.
  }
}

test.describe("setlist × repertório", () => {
  test("busca no catálogo e escolhe a música para a setlist", async ({ page, api }) => {
    const songTitle = `E2E busca ${Date.now()}`;
    const song = await api.call<Song>("POST", "/songs", { title: songTitle, key: "D", bpm: 96 });
    let instanceId: string | null = null;

    try {
      const worship = await setupWorship(api);
      instanceId = worship.instanceId;

      await openServiceOrder(page, worship.date);
      await page.getByRole("button", { name: "Adicionar música" }).click();

      await page.getByPlaceholder("Buscar no repertório…").fill("E2E busca");
      await page.getByRole("button").filter({ hasText: songTitle }).first().click();

      await expect(
        page.getByPlaceholder("Título *"),
        "escolher no seletor não pré-preencheu o título"
      ).toHaveValue(songTitle);
      await expect(page.getByPlaceholder("Tom (ex: G)")).toHaveValue("D");
      await shot(page, "23-setlist-seletor-repertorio");

      await page.getByRole("button", { name: "Adicionar", exact: true }).click();

      await expect(page.getByText(songTitle, { exact: true })).toBeVisible();
      await expect(
        page.getByText("Repertório", { exact: true }).first(),
        "a música adicionada do catálogo não ficou marcada como vinda do repertório"
      ).toBeVisible();
      await shot(page, "24-setlist-com-vinculo");
    } finally {
      if (instanceId) await api.tryCall("DELETE", `/celebrations/instances/${instanceId}`);
      await api.tryCall("DELETE", `/songs/${song.id}`);
    }
  });

  test("cadastra a música no repertório sem sair da ordem de culto e já usa", async ({ page, api }) => {
    const songTitle = `E2E cadastro inline ${Date.now()}`;
    let instanceId: string | null = null;

    try {
      const worship = await setupWorship(api);
      instanceId = worship.instanceId;

      await openServiceOrder(page, worship.date);
      await page.getByRole("button", { name: "Adicionar música" }).click();
      await page.getByRole("button", { name: "Cadastrar música no repertório" }).click();

      await page.getByLabel("Título", { exact: true }).fill(songTitle);
      await page.getByLabel("Tom", { exact: true }).fill("A");
      await page.getByRole("button", { name: "Criar e usar" }).click();

      await expect(
        page.getByPlaceholder("Título *"),
        "a música recém-cadastrada não veio selecionada no form da setlist"
      ).toHaveValue(songTitle);
      await expect(page.getByPlaceholder("Tom (ex: G)")).toHaveValue("A");

      await page.getByRole("button", { name: "Adicionar", exact: true }).click();

      await expect(page.getByText(songTitle, { exact: true })).toBeVisible();
      await expect(page.getByText("Repertório", { exact: true }).first()).toBeVisible();
      await shot(page, "25-setlist-cadastro-inline");
    } finally {
      if (instanceId) await api.tryCall("DELETE", `/celebrations/instances/${instanceId}`);
      await deleteSongByTitle(api, songTitle);
    }
  });

  test("vincula ao catálogo uma música digitada avulsa", async ({ page, api }) => {
    const songTitle = `E2E vínculo ${Date.now()}`;
    const avulsaTitle = `E2E avulsa ${Date.now()}`;
    const song = await api.call<Song>("POST", "/songs", { title: songTitle, key: "E" });
    let instanceId: string | null = null;

    try {
      const worship = await setupWorship(api);
      instanceId = worship.instanceId;
      // Música de texto livre: entra na setlist sem `song_id`, como quem digita.
      await api.call("POST", "/celebrations/setlists/songs", {
        setlist_id: worship.setlistId,
        sequence: 1,
        title: avulsaTitle,
        key: "G",
      });

      await openServiceOrder(page, worship.date);
      await expect(page.getByText(avulsaTitle, { exact: true })).toBeVisible();
      await expect(page.getByText("Repertório", { exact: true })).toHaveCount(0);

      await page
        .getByRole("button", { name: `Vincular ${avulsaTitle} ao repertório` })
        .click();
      await page.getByPlaceholder("Buscar no repertório…").fill("E2E vínculo");
      await page.getByRole("button").filter({ hasText: songTitle }).first().click();

      await expect(
        page.getByText("Repertório", { exact: true }).first(),
        "vincular pela linha não refletiu a origem na lista"
      ).toBeVisible();
      // O tom digitado na escala continua o mesmo: vincular declara a origem,
      // não reimporta os valores do catálogo (a música do catálogo é em E).
      await expect(page.getByText("G", { exact: true }).first()).toBeVisible();
      await expect(
        page.getByRole("button", { name: `Desvincular ${avulsaTitle} do repertório` })
      ).toBeVisible();
      await shot(page, "26-setlist-vinculo-avulsa");
    } finally {
      if (instanceId) await api.tryCall("DELETE", `/celebrations/instances/${instanceId}`);
      await api.tryCall("DELETE", `/songs/${song.id}`);
    }
  });
});
