/**
 * Cobertura E2E da tela `/materiais` (PROD-38): criar material com alcance,
 * editar o alcance depois e conferir o que chega ao PG — pela API
 * (`GET /small-groups/:id/materials`) e pela aba "Materiais" da gaveta do PG.
 *
 * O primeiro teste usa "Texto ou link" (o que ele verifica é o alcance). Os
 * outros dois sobem arquivo de verdade — `/materiais` e o modal de reunião —,
 * pelo caminho real: ticket pelo proxy, arquivo direto na API
 * (`NEXT_PUBLIC_API_UPLOAD_URL`), validação de conteúdo e gravação. No e2e
 * local a API usa `STORAGE_DRIVER=stub` (storage em memória, sem R2); no
 * `e2e-prod` o upload vai ao bucket real, no tenant de teste, e a limpeza
 * apaga o objeto junto com o material.
 *
 * Só roda em `teste1-church`/`teste2-church` (E2E_EMAIL deve ser de um deles);
 * tudo o que o teste cria é apagado no fim.
 *
 * Uso: E2E_EMAIL=... E2E_PASSWORD=... npm run e2e -w orbien-web
 */

import { expect, shot, test, realConsoleErrors, unexpectedHttp } from "./fixtures";

interface Group { id: string; name: string }
interface GroupType { id: string; name: string }
interface Person { id: string; full_name: string }
interface GroupMaterial { id: string; title: string; visibility: string }
interface Material { id: string; title: string; source_type?: string; file_url?: string | null }

// Conteúdo mínimo que passa na validação por magic bytes da API.
const PDF = { name: "estudo.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%E2E\n%%EOF\n") };
const DOCX = {
  name: "estudo.docx",
  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  buffer: Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("word/document.xml")]),
};

/** Apaga, pela API, os materiais de teste que ficaram com estes títulos. */
async function limpaMateriais(api: { call<T>(m: string, p: string): Promise<T>; tryCall(m: string, p: string): Promise<void> }, titulos: string[]) {
  const materiais = await api.call<{ data: Material[] }>("GET", "/study-materials?limit=100");
  for (const m of materiais.data) {
    if (titulos.includes(m.title)) await api.tryCall("DELETE", `/study-materials/${m.id}`);
  }
}

test.describe("materiais", () => {
  test("cria para todas as redes, restringe a um PG só para líderes e confere no PG", async ({
    page,
    errorLog,
    api,
  }) => {
    const stamp = Date.now();
    const titulo = `Material E2E ${stamp}`;
    const nomeA = `PG E2E Material A ${stamp}`;
    const nomeB = `PG E2E Material B ${stamp}`;
    const groupIds: string[] = [];

    try {
      await test.step("cria dois PGs via API", async () => {
        const tipos = await api.call<GroupType[]>("GET", "/groups/types");
        const pessoas = await api.call<{ data: Person[] }>("GET", "/persons?limit=1");
        for (const name of [nomeA, nomeB]) {
          const criado = await api.call<Group>("POST", "/small-groups", {
            name,
            group_type_id: tipos[0].id,
            leader_person_id: pessoas.data[0].id,
          });
          groupIds.push(criado.id);
        }
      });

      await test.step("cria o material para todas as redes pela UI", async () => {
        // A lista carregada prova que a tela hidratou: clicar antes disso é
        // engolido ou remonta o modal no meio do preenchimento.
        const lista = page.waitForResponse(
          (r) => r.url().includes("/study-materials") && r.request().method() === "GET"
        );
        await page.goto("/materiais", { waitUntil: "domcontentloaded" });
        await lista;
        await page.getByRole("button", { name: "Novo material" }).click();
        await page.getByRole("textbox", { name: "Título", exact: true }).fill(titulo);
        await page.getByLabel("Texto ou link").check();
        await page.getByLabel("Texto ou link do material").fill("Leia Rute 1 e responda em casa.");
        await page.getByLabel("Todas as redes").check();
        await page.getByRole("button", { name: "Publicar material" }).click();

        const linha = page.getByRole("row").filter({ hasText: titulo });
        await expect(linha).toBeVisible();
        await expect(linha).toContainText("Todas as redes");
        await expect(linha).toContainText("Todos os participantes");
        await shot(page, "60-materiais-lista");
      });

      await test.step("o material chega aos dois PGs criados antes dele", async () => {
        for (const id of groupIds) {
          const lista = await api.call<GroupMaterial[]>("GET", `/small-groups/${id}/materials`);
          expect(lista.map((m) => m.title), `PG ${id} não recebeu o material de todas as redes`).toContain(
            titulo
          );
        }
      });

      // O `e2e-prod` roda contra o que está no ar. Enquanto a edição de alcance e
      // a aba "Materiais" do PG não foram para produção, o resto do spec não tem
      // o que exercitar; o que vale antes disso (criar e chegar ao PG) já rodou.
      // Depois do deploy o botão existe e o spec inteiro volta a valer.
      const editar = page
        .getByRole("row")
        .filter({ hasText: titulo })
        .getByRole("button", { name: "Editar material" });
      test.skip(
        (await editar.count()) === 0,
        "Edição de material ainda não está no ambiente testado (e2e-prod antes do deploy)."
      );

      await test.step("edita: só o PG B, só líderes", async () => {
        await editar.click();
        await expect(page.getByRole("heading", { name: "Editar material" })).toBeVisible();
        await expect(page.getByRole("textbox", { name: "Título", exact: true })).toHaveValue(titulo);

        await page.getByLabel("Um PG").check();
        await page.getByLabel("PG", { exact: true }).selectOption({ label: nomeB });
        await page.getByLabel("Somente líderes").check();
        await shot(page, "61-materiais-edicao");
        await page.getByRole("button", { name: "Salvar alterações" }).click();

        const linha = page.getByRole("row").filter({ hasText: titulo });
        await expect(linha).toContainText("Somente líderes");
        await expect(linha).not.toContainText("Todas as redes");
      });

      await test.step("o PG A perdeu o material; o PG B ficou com ele, só para líderes", async () => {
        const [idA, idB] = groupIds;
        const emA = await api.call<GroupMaterial[]>("GET", `/small-groups/${idA}/materials`);
        expect(emA.map((m) => m.title), "o PG A manteve o material depois da edição").not.toContain(titulo);

        const emB = await api.call<GroupMaterial[]>("GET", `/small-groups/${idB}/materials`);
        const doB = emB.find((m) => m.title === titulo);
        expect(doB, "o PG B não recebeu o material").toBeTruthy();
        expect(doB?.visibility).toBe("leaders_only");
      });

      await test.step("a aba Materiais da gaveta do PG B mostra o material", async () => {
        await page.goto("/grupos", { waitUntil: "domcontentloaded" });
        await page.getByPlaceholder("Buscar grupos…").fill(nomeB);
        await page.getByRole("cell", { name: nomeB }).click();
        await expect(page.getByRole("heading", { name: nomeB })).toBeVisible();

        await page.getByRole("tab", { name: "Materiais" }).click();
        await expect(page.getByText(titulo)).toBeVisible();
        await expect(page.getByText("Somente líderes")).toBeVisible();
        await shot(page, "62-pg-materiais");
        await page.getByRole("button", { name: /^(Close|Voltar para )/ }).click();
      });

      await test.step("sem erro de console ou HTTP inesperado", async () => {
        expect(realConsoleErrors(errorLog), "erros de console na tela de materiais").toEqual([]);
        expect(unexpectedHttp(errorLog), "respostas HTTP com erro").toEqual([]);
      });

    } finally {
      // Limpeza — também quando o spec se pula ou falha no meio.
      const materiais = await api.call<{ data: Material[] }>("GET", "/study-materials?limit=100");
      for (const m of materiais.data) {
        if (m.title === titulo) await api.tryCall("DELETE", `/study-materials/${m.id}`);
      }
      for (const id of groupIds) await api.tryCall("DELETE", `/small-groups/${id}`);
    }
  });
  test("arquivo: sobe um PDF pela tela, troca por Word e o material continua no mesmo registro", async ({
    page,
    errorLog,
    api,
  }) => {
    const titulo = `Material Arquivo E2E ${Date.now()}`;
    try {
      await test.step("publica um PDF para todas as redes", async () => {
        const lista = page.waitForResponse(
          (r) => r.url().includes("/study-materials") && r.request().method() === "GET"
        );
        await page.goto("/materiais", { waitUntil: "domcontentloaded" });
        await lista;
        await page.getByRole("button", { name: "Novo material" }).click();
        await page.getByRole("textbox", { name: "Título", exact: true }).fill(titulo);
        await page.getByLabel("Arquivo do material").setInputFiles(PDF);
        await page.getByLabel("Todas as redes").check();
        await page.getByRole("button", { name: "Publicar material" }).click();
        await expect(page.getByRole("row").filter({ hasText: titulo })).toBeVisible();
      });

      let idDoMaterial = "";
      let urlDoPdf = "";
      await test.step("a API guardou o arquivo como PDF", async () => {
        const { data } = await api.call<{ data: Material[] }>("GET", "/study-materials?limit=100");
        const criado = data.find((m) => m.title === titulo);
        expect(criado, "o material não aparece na API depois do upload").toBeTruthy();
        expect(criado?.source_type).toBe("pdf");
        expect(criado?.file_url).toBeTruthy();
        idDoMaterial = criado!.id;
        urlDoPdf = criado!.file_url!;
      });

      await test.step("troca o arquivo por um Word pela edição", async () => {
        await page.getByRole("row").filter({ hasText: titulo }).getByRole("button", { name: "Editar material" }).click();
        await expect(page.getByRole("heading", { name: "Editar material" })).toBeVisible();
        // O `e2e-prod` roda contra o que está no ar: antes do deploy da troca de
        // arquivo a edição não tem o campo, e o resto do passo não tem o que testar.
        test.skip(
          (await page.getByLabel("Arquivo do material").count()) === 0,
          "Troca de arquivo ainda não está no ambiente testado (e2e-prod antes do deploy)."
        );
        await page.getByLabel("Arquivo do material").setInputFiles(DOCX);
        await page.getByRole("button", { name: "Salvar alterações" }).click();
        await expect(page.getByRole("heading", { name: "Editar material" })).toBeHidden();

        const { data } = await api.call<{ data: Material[] }>("GET", "/study-materials?limit=100");
        const depois = data.filter((m) => m.title === titulo);
        expect(depois, "a troca criou outro material em vez de editar o mesmo").toHaveLength(1);
        expect(depois[0].id).toBe(idDoMaterial);
        expect(depois[0].source_type).toBe("doc");
        expect(depois[0].file_url).toBeTruthy();
        expect(depois[0].file_url).not.toBe(urlDoPdf);
      });

      await test.step("sem erro de console ou HTTP inesperado", async () => {
        expect(realConsoleErrors(errorLog), "erros de console no upload de material").toEqual([]);
        expect(unexpectedHttp(errorLog), "respostas HTTP com erro").toEqual([]);
      });
    } finally {
      await limpaMateriais(api, [titulo]);
    }
  });

  test("arquivo: registra a reunião de um PG, anexa um PDF e o material chega ao PG", async ({
    page,
    errorLog,
    api,
  }) => {
    const stamp = Date.now();
    const nomePg = `PG E2E Reunião Arquivo ${stamp}`;
    const titulo = `Roteiro E2E ${stamp}`;
    let grupoId = "";

    try {
      await test.step("cria um PG via API", async () => {
        const tipos = await api.call<GroupType[]>("GET", "/groups/types");
        const pessoas = await api.call<{ data: Person[] }>("GET", "/persons?limit=1");
        const criado = await api.call<Group>("POST", "/small-groups", {
          name: nomePg,
          group_type_id: tipos[0].id,
          leader_person_id: pessoas.data[0].id,
        });
        grupoId = criado.id;
      });

      await test.step("registra a reunião e anexa o PDF pelo modal", async () => {
        await page.goto("/grupos", { waitUntil: "domcontentloaded" });
        await page.getByPlaceholder("Buscar grupos…").fill(nomePg);
        await page.getByRole("cell", { name: nomePg }).click();
        await expect(page.getByRole("heading", { name: nomePg })).toBeVisible();

        await page.getByRole("tab", { name: "Reuniões" }).click();
        await page.getByRole("button", { name: "Registrar reunião" }).click();
        await page.getByLabel(/^Data/).fill("2026-01-15");
        await page.getByRole("button", { name: "Registrar e marcar presença" }).click();

        await page.getByRole("button", { name: "Enviar PDF ou Word" }).click();
        await page.getByPlaceholder("Título do material").fill(titulo);
        await page.getByLabel("Arquivo do material").setInputFiles(PDF);
        await page.getByRole("button", { name: "Adicionar material" }).click();

        // O material entra na lista do modal quando a API devolve o vínculo.
        await expect(page.getByText(titulo)).toBeVisible();
        await shot(page, "63-reuniao-material-arquivo");
        await page.getByRole("button", { name: "Finalizar" }).click();
      });

      await test.step("o PDF é do PG da reunião, com arquivo guardado", async () => {
        const doPg = await api.call<(GroupMaterial & { file_url?: string | null; source_type?: string })[]>(
          "GET",
          `/small-groups/${grupoId}/materials`
        );
        const anexado = doPg.find((m) => m.title === titulo);
        expect(anexado, "o PG não recebeu o material anexado à reunião").toBeTruthy();
        expect(anexado?.source_type).toBe("pdf");
        expect(anexado?.file_url).toBeTruthy();
      });

      await test.step("sem erro de console ou HTTP inesperado", async () => {
        expect(realConsoleErrors(errorLog), "erros de console no modal de reunião").toEqual([]);
        expect(unexpectedHttp(errorLog), "respostas HTTP com erro").toEqual([]);
      });
    } finally {
      await limpaMateriais(api, [titulo]);
      if (grupoId) await api.tryCall("DELETE", `/small-groups/${grupoId}`);
    }
  });
});
