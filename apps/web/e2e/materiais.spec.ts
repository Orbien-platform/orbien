/**
 * Cobertura E2E da tela `/materiais` (PROD-38): criar material com alcance,
 * editar o alcance depois e conferir o que chega ao PG — pela API
 * (`GET /small-groups/:id/materials`) e pela aba "Materiais" da gaveta do PG.
 *
 * O conteúdo é "Texto ou link", e não arquivo: o upload sobe direto na API
 * (`NEXT_PUBLIC_API_UPLOAD_URL`) e não depende deste spec para o que ele
 * verifica — o alcance. O modo arquivo tem teste de componente
 * (`MaterialFormModal.test.tsx`, `upload-study-material.test.ts`).
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
interface Material { id: string; title: string }

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
        await page.getByLabel("Título").fill(titulo);
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
        await expect(page.getByLabel("Título")).toHaveValue(titulo);

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
});
