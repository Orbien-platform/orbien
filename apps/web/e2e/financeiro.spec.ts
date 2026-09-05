/**
 * Fluxo de tesouraria de ponta a ponta: lançar uma transação e conferir que
 * ela chegou ao DRE, na categoria certa.
 *
 * É o primeiro item da Fase 13 de docs/TESTES.md, e está primeiro na lista por
 * ordem de dano: lançamento que não aparece no DRE é erro de relatório
 * contábil, e o relatório é o que sai da igreja para o contador.
 *
 * O que este teste prende, e nenhum teste de unidade prende, é a **cadeia**:
 * o modal grava com `occurred_at` em `T12:00:00` da data escolhida, a API
 * agrega por período, e o DRE lê esse agregado com o período padrão (do dia
 * 1º do mês até hoje). Um fuso trocado no meio, uma agregação por `created_at`
 * em vez de `occurred_at`, ou a categoria filha somada na conta errada
 * aparecem aqui e só aqui.
 *
 * A asserção é sobre a coluna **Qtd** da categoria, não sobre o valor
 * formatado: Qtd é inteiro, e comparar "quantos lançamentos esta conta tem"
 * antes e depois não depende de mais nenhum dado do tenant. Prender o total em
 * reais faria o teste depender de tudo o mais que foi lançado no mês.
 *
 * Uso: E2E_EMAIL=... E2E_PASSWORD=... E2E_TENANT=... npm run e2e -w orbien-web
 */

import { expect, shot, test, realConsoleErrors, unexpectedHttp, type Page } from "./fixtures";
import type { Locator } from "@playwright/test";

interface Category {
  id: string;
  name: string;
  type: "income" | "expense";
  children: { id: string; name: string; type: string }[];
}

interface Transaction {
  id: string;
  description: string;
}

/** Data de hoje em ISO (YYYY-MM-DD), o formato do `<input type="date">`. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Abre uma aba e só volta quando o conteúdo dela apareceu.
 *
 * Mesmo problema do `selectTab` das escalas — a aba só responde depois da
 * hidratação — mas as abas daqui são `Tabs.Tab` do Base UI sem `aria-selected`
 * estável, então quem sinaliza que a aba abriu é um elemento do painel.
 */
async function openTab(page: Page, name: string, sinal: () => Promise<void>): Promise<void> {
  await expect(async () => {
    await page.getByRole("tab", { name }).click();
    await sinal();
  }, `a aba "${name}" não respondeu ao clique`).toPass({ timeout: 60_000 });
}

/**
 * Lê a coluna "Qtd" da linha do DRE cuja primeira célula é `nome`.
 *
 * Devolve 0 quando a linha não existe: no DRE, categoria sem lançamento no
 * período simplesmente não é listada (o grupo mostra "Sem lançamentos"), e
 * "ausente" e "zero" são o mesmo estado para o que este teste afirma.
 *
 * A Qtd é a penúltima célula — [Conta, Total, Qtd, Δ]. No perfil de pastor a
 * coluna Total não é renderizada, e a penúltima continua sendo a Qtd.
 *
 * As células saem de `querySelectorAll("td")`, não de `innerText` quebrado por
 * `\n`: o `innerText` de um `<tr>` separa célula com **tab**, não com quebra de
 * linha. Dividir por `\n` devolvia a linha inteira como se fosse a primeira
 * célula, nenhuma linha casava com o nome, e a função respondia 0 para tudo —
 * inclusive para a categoria que tinha lançamento.
 */
async function dreCount(rows: Locator, nome: string): Promise<number> {
  const linhas = await rows.evaluateAll((trs) =>
    trs.map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => (td.textContent ?? "").trim())),
  );
  const row = linhas.find((cells) => cells[0] === nome);
  if (!row) return 0;
  const qtd = row[row.length - 2] ?? "";
  return qtd === "—" || qtd === "" ? 0 : Number(qtd);
}

test.describe("financeiro", () => {
  test("lança transação e ela aparece no DRE na categoria certa", async ({
    page,
    errorLog,
    api,
  }) => {
    const descricao = `Lançamento E2E ${Date.now()}`;
    // 137,00 — o `CurrencyInput` aceita só dígitos e divide por 100, então o
    // que se digita é "13700". Valor sem redondeza de propósito: se algum dia
    // colidir com um lançamento de seed, o número não passa despercebido.
    const digitos = "13700";

    // A categoria vem da API, não de um nome fixado no teste: qualquer tenant
    // com financeiro configurado tem ao menos uma categoria de receita, e
    // prender um nome faria o teste falhar por renomeação de categoria.
    const categorias = await api.call<Category[]>("GET", "/financial/categories");
    const receita = categorias.find((c) => c.type === "income");
    if (!receita) {
      throw new Error("Nenhuma categoria de receita cadastrada — impossível lançar receita.");
    }

    // Escopo pela tabela que tem a coluna "Conta": as abas do Base UI mantêm
    // os painéis montados, e a aba de Lançamentos tem uma tabela também.
    const dreRows = page.locator('table:has(th:text-is("Conta")) tbody tr');
    let qtdAntes = 0;

    await test.step("DRE abre no período do mês e registra o ponto de partida", async () => {
      await page.goto("/financeiro", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Financeiro" })).toBeVisible();

      await openTab(page, "DRE", async () => {
        await expect(dreRows.first()).toBeVisible({ timeout: 3_000 });
      });

      await expect(page.getByRole("cell", { name: "RECEITAS" })).toBeVisible();
      await expect(page.getByRole("cell", { name: "DESPESAS" })).toBeVisible();

      qtdAntes = await dreCount(dreRows, receita.name);
      await shot(page, "30-financeiro-dre-antes");
    });

    await test.step("lançamento é registrado e aparece na lista", async () => {
      await openTab(page, "Lançamentos", async () => {
        await expect(page.getByRole("button", { name: "Novo lançamento" })).toBeVisible({
          timeout: 3_000,
        });
      });

      await page.getByRole("button", { name: "Novo lançamento" }).click();
      const modal = page.getByRole("dialog");
      await expect(modal.getByText("Novo lançamento")).toBeVisible();

      // "Entrada" já é o padrão do modal, mas clicar é o que garante que o
      // toggle e a filtragem da categoria por tipo estão no ramo de receita.
      await modal.getByRole("button", { name: "Entrada", exact: true }).click();
      await modal.locator("select").first().selectOption(receita.id);
      await modal.locator("#nt-amount").fill(digitos);
      await modal.locator("#nt-date").fill(todayIso());
      await modal.locator("#nt-desc").fill(descricao);

      await modal.getByRole("button", { name: "Registrar" }).click();
      await expect(
        page.getByText("Lançamento registrado!"),
        "o modal não confirmou o registro",
      ).toBeVisible();

      // O modal fecha sozinho 1,2s depois e manda a lista recarregar.
      await expect(modal).toHaveCount(0);
      await expect(
        page.getByRole("cell", { name: descricao }),
        "o lançamento criado não apareceu na lista",
      ).toBeVisible();
    });

    await test.step("DRE soma o lançamento na categoria escolhida", async () => {
      // `page.reload()` e não só a troca de aba: o efeito do DRE guarda o
      // período já buscado em `prevDreKey` e **não** refaz o fetch ao voltar
      // para a aba com o mesmo período (financeiro/page.tsx). Sem recarregar,
      // o teste leria para sempre o agregado anterior ao lançamento — passaria
      // a afirmar o cache do componente em vez do relatório.
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Financeiro" })).toBeVisible();

      await openTab(page, "DRE", async () => {
        await expect(dreRows.first()).toBeVisible({ timeout: 3_000 });
      });

      // O `toPass` cobre a janela entre o skeleton e o agregado carregado.
      await expect(async () => {
        expect(
          await dreCount(dreRows, receita.name),
          `a Qtd de "${receita.name}" no DRE não subiu para ${qtdAntes + 1} — o lançamento não chegou ao relatório`,
        ).toBe(qtdAntes + 1);
      }).toPass({ timeout: 60_000 });

      await shot(page, "31-financeiro-dre-depois");
    });

    await test.step("sem erro de console ou HTTP inesperado", async () => {
      expect(realConsoleErrors(errorLog), "erros de console na tela de financeiro").toEqual([]);
      expect(unexpectedHttp(errorLog), "respostas HTTP com erro").toEqual([]);
    });

    // ── Limpeza ──
    // Pelo id, achado pela descrição única: o tenant é compartilhado com os
    // outros specs e com o seed.
    const lista = await api.call<{ data: Transaction[] }>(
      "GET",
      "/financial/transactions?limit=100",
    );
    const criadoId = lista.data.find((t) => t.description === descricao)?.id ?? null;
    if (criadoId) await api.tryCall("DELETE", `/financial/transactions/${criadoId}`);
  });
});
