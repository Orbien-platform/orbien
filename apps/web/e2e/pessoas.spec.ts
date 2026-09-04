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
 * O segundo `test` cobre a **importação de CSV**, pedida pela Fase 13 de
 * docs/TESTES.md. Fica neste arquivo, e não em um spec próprio, porque é a
 * mesma tela: o `workers: 1` do runner garante que os dois rodem em série, e
 * separar faria a lista de pessoas ser carregada duas vezes sem ganho.
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

  test("importação de CSV mapeia colunas e grava as pessoas do arquivo", async ({
    page,
    errorLog,
    api,
  }) => {
    // Nomes únicos por execução: o tenant é compartilhado com o seed e com os
    // outros specs, e a importação não é idempotente — rodar duas vezes com o
    // mesmo nome criaria duplicata em vez de falhar.
    const marca = Date.now();
    const nomes = [`Importado E2E A ${marca}`, `Importado E2E B ${marca}`];

    // Cabeçalhos deliberadamente **fora** dos nomes de campo do Orbien
    // ("Nome do membro", não "full_name"): o que este teste prende é o passo de
    // mapeamento. Com cabeçalhos já iguais aos campos, a sugestão automática
    // acertaria tudo e o mapeamento manual nunca seria exercido.
    const csv = [
      "Nome do membro,Celular,Contato de email",
      `${nomes[0]},11988880001,importado.a.${marca}@exemplo.test`,
      `${nomes[1]},11988880002,importado.b.${marca}@exemplo.test`,
    ].join("\n");

    await test.step("modal de importação aceita o arquivo e vai para o mapeamento", async () => {
      await page.goto("/pessoas", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Importar CSV" }).click();

      const modal = page.getByRole("dialog");
      await expect(modal.getByText("Importar CSV")).toBeVisible();
      await expect(modal.getByText("Arraste um arquivo .csv aqui")).toBeVisible();

      // `setInputFiles` no input escondido é o caminho suportado pelo runner:
      // o `<input type="file">` do modal tem `className="hidden"` e é acionado
      // pelo clique na área de arraste, que não dá para automatizar com um
      // arquivo real.
      await modal.locator('input[type="file"]').setInputFiles({
        name: `import-e2e-${marca}.csv`,
        mimeType: "text/csv",
        buffer: Buffer.from(csv, "utf-8"),
      });

      await expect(
        modal.getByText("2 linha(s) de prévia · 3 colunas detectadas"),
        "o preview não reconheceu as 2 linhas e 3 colunas do arquivo",
      ).toBeVisible();
      await shot(page, "22-pessoas-import-mapeamento");
    });

    await test.step("mapeamento manual grava as duas pessoas", async () => {
      const modal = page.getByRole("dialog");
      const selects = modal.locator("select");
      await expect(selects, "um select por coluna do CSV").toHaveCount(3);

      // A ordem dos selects segue `preview.columns`, que segue a ordem do
      // cabeçalho do arquivo.
      await selects.nth(0).selectOption("full_name");
      await selects.nth(1).selectOption("phone");
      await selects.nth(2).selectOption("email");

      await modal.getByRole("button", { name: "Importar" }).click();

      await expect(
        modal.getByText("Importação concluída sem erros!"),
        "a importação relatou erro",
      ).toBeVisible();
      // O cartão do resultado é `<p>{imported}</p><p>importados</p>` — irmãos
      // dentro do mesmo bloco. Ancorar no rótulo e voltar um irmão é o que
      // dispensa depender de classe de estilo.
      await expect(
        modal.locator('p:text-is("importados")').locator("xpath=preceding-sibling::p[1]"),
        "o resultado não contou as 2 pessoas importadas",
      ).toHaveText("2");

      await modal.getByRole("button", { name: "Concluir" }).click();
      await expect(modal).toHaveCount(0);
    });

    await test.step("as pessoas importadas aparecem na lista sem recarregar a página", async () => {
      // `Concluir` chama `onImported()`, que recarrega a lista no mesmo
      // documento — é isso que a asserção sem `goto` prende.
      for (const nome of nomes) {
        await page.getByPlaceholder(BUSCA).fill(nome);
        await expect(
          page.getByRole("cell", { name: nome }),
          `a pessoa importada "${nome}" não está na lista`,
        ).toBeVisible();
      }
      await page.getByPlaceholder(BUSCA).fill("");
    });

    await test.step("sem erro de console ou HTTP inesperado", async () => {
      expect(realConsoleErrors(errorLog), "erros de console na importação").toEqual([]);
      expect(unexpectedHttp(errorLog), "respostas HTTP com erro").toEqual([]);
    });

    // ── Limpeza ──
    for (const nome of nomes) {
      const lista = await api.call<{ data: { id: string; full_name: string }[] }>(
        "GET",
        `/persons?limit=100&search=${encodeURIComponent(nome)}`,
      );
      const id = lista.data.find((p) => p.full_name === nome)?.id;
      if (id) await api.tryCall("DELETE", `/persons/${id}`);
    }
  });

});
