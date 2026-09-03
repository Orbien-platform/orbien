/**
 * Cobertura permanente da tela de Pessoas.
 *
 * Existe por causa do `c84fc02` — o commit que zerou o lint do web reescreveu
 * os effects desta tela e trocou seis comportamentos, verificados na época por
 * specs temporários que não ficaram (pendência nº 4 de docs/PENDENCIAS.md).
 * Cada bloco abaixo prende um deles:
 *
 *   #1 reset de sheet migrou da abertura para o fechamento
 *   #3 cancelamento de load — resposta antiga não sobrescreve estado novo
 *   #4 o contador `fetchRef` de pessoas foi substituído por esse cancelamento
 *   #5 criar registro passou de 2 fetches para 1
 *
 * Uso: E2E_EMAIL=... E2E_PASSWORD=... E2E_TENANT=... npm run e2e -w orbien-web
 */

import { expect, shot, test, realConsoleErrors, unexpectedHttp } from "./fixtures";

const BUSCA = "Buscar por nome…";

test.describe("pessoas", () => {
  test("lista, busca, sheet e cadastro", async ({ page, errorLog, api }) => {
    const rows = page.locator("tbody tr");
    const busca = page.getByPlaceholder(BUSCA);
    const nome = `Visitante E2E ${Date.now()}`;
    let criadoId: string | null = null;

    await test.step("lista carrega com as pessoas do seed", async () => {
      await page.goto("/pessoas", { waitUntil: "domcontentloaded" });
      // O seed cria Carlos Pereira, Maria Rodrigues e as pessoas das duas
      // contas. Prender o número exato tornaria o teste refém do seed; o que
      // importa é que a lista chegou preenchida.
      await expect(rows.first(), "a lista de pessoas não carregou").toBeVisible();
      await expect(page.getByRole("cell", { name: "Carlos Pereira" })).toBeVisible();
      await shot(page, "20-pessoas-lista");
    });

    const total = await rows.count();

    await test.step("busca filtra e limpar restaura", async () => {
      await busca.fill("Carlos");
      await expect(page.getByRole("cell", { name: "Carlos Pereira" })).toBeVisible();
      await expect(rows, "a busca não filtrou").toHaveCount(1);

      await busca.fill("");
      await expect(rows, "limpar a busca não restaurou a lista").toHaveCount(total);
    });

    await test.step("#3/#4 troca rápida de termo: vence o último, não o que responder por último", async () => {
      // Antes o load não era cancelável e havia um contador `fetchRef` que
      // resolvia metade do problema. Digitar dois termos em sequência sem
      // esperar o primeiro terminar é o cenário em que a resposta antiga
      // chegava depois e sobrescrevia a lista.
      await busca.fill("Carlos");
      await busca.fill("Maria");
      await expect(page.getByRole("cell", { name: "Maria Rodrigues" })).toBeVisible();
      await expect(
        page.getByRole("cell", { name: "Carlos Pereira" }),
        "resposta antiga sobrescreveu o resultado do termo mais recente"
      ).toHaveCount(0);
      await busca.fill("");
      await expect(rows).toHaveCount(total);
    });

    await test.step("sheet abre no registro clicado, e troca de registro", async () => {
      await page.getByRole("cell", { name: "Carlos Pereira" }).click();
      await expect(page.getByRole("heading", { name: "Carlos Pereira" })).toBeVisible();

      await page.getByRole("button", { name: "Close" }).click();
      await expect(page.getByRole("heading", { name: "Carlos Pereira" })).toHaveCount(0);

      await page.getByRole("cell", { name: "Maria Rodrigues" }).click();
      await expect(page.getByRole("heading", { name: "Maria Rodrigues" })).toBeVisible();
      await shot(page, "21-pessoas-sheet");
      await page.getByRole("button", { name: "Close" }).click();
    });

    await test.step("#1 fechar em modo de edição não deixa o sheet sujo", async () => {
      // Esta é a asserção que de fato distingue o reset no fechamento. A troca
      // de registro, por si, já é protegida pelo carregamento derivado
      // (`loadedFor !== personId` mostra o skeleton em vez do anterior) — foi
      // verificado removendo o reset: o nome antigo não aparece. O que só o
      // reset protege é o estado de UI que não depende do id: `isEditing`.
      // Sem ele, fechar no meio de uma edição e reabrir devolve o formulário
      // aberto com o rascunho antigo.
      await page.getByRole("cell", { name: "Carlos Pereira" }).click();
      await page.getByRole("button", { name: "Editar" }).click();
      await expect(page.getByRole("button", { name: "Salvar" })).toBeVisible();

      await page.getByRole("button", { name: "Close" }).click();
      await page.getByRole("cell", { name: "Carlos Pereira" }).click();

      await expect(
        page.getByRole("button", { name: "Editar" }),
        "o sheet reabriu em modo de edição — o fechamento não resetou"
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Salvar" })).toHaveCount(0);
      await page.getByRole("button", { name: "Close" }).click();
    });

    await test.step("#5 cadastro aparece na lista sem recarregar a página", async () => {
      await page.getByRole("button", { name: "Cadastrar visitante" }).click();
      await page.getByPlaceholder("ex: Maria Silva").fill(nome);
      await page.getByPlaceholder("(11) 99999-9999").fill("11999990000");
      await page.getByRole("button", { name: "Cadastrar", exact: true }).click();

      await expect(
        page.getByRole("cell", { name: nome }),
        "a pessoa criada não apareceu na lista"
      ).toBeVisible();
    });

    await test.step("sem erro de console ou HTTP inesperado", async () => {
      expect(realConsoleErrors(errorLog), "erros de console na tela de pessoas").toEqual([]);
      expect(unexpectedHttp(errorLog), "respostas HTTP com erro").toEqual([]);
    });

    // ── Limpeza ──
    const lista = await api.call<{ data: { id: string; full_name: string }[] }>(
      "GET",
      `/persons?limit=100&search=${encodeURIComponent(nome)}`
    );
    criadoId = lista.data.find((p) => p.full_name === nome)?.id ?? null;
    if (criadoId) await api.tryCall("DELETE", `/persons/${criadoId}`);
  });
});
