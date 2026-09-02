/**
 * Percorre a tela de escala por celebração e a de indisponibilidade.
 *
 * Não é um teste de unidade: sobe o navegador contra o app rodando e falha se
 * a tela não chegar aos estados esperados. Gera capturas em e2e/screenshots/
 * para inspeção visual.
 *
 * Uso (com API em :3000 e web em :3001):
 *   E2E_EMAIL=... E2E_PASSWORD=... E2E_TENANT=... npm run e2e -w orbien-web
 */

import { expect, selectTab, shot, test, realConsoleErrors, unexpectedHttp } from "./fixtures";

test.describe("escala por celebração", () => {
  test("monta a escala e marca indisponibilidade", async ({
    page,
    errorLog,
    upcomingInstance,
    scheduleTemplate,
  }) => {
    test.info().annotations.push({
      type: "fixture",
      description: upcomingInstance.created
        ? `instância temporária criada (${upcomingInstance.value.id.slice(0, 8)})`
        : `reaproveitando instância futura existente (${upcomingInstance.value.id.slice(0, 8)})`,
    });
    test.info().annotations.push({
      type: "fixture",
      description: scheduleTemplate.created
        ? "template temporário criado para o teste"
        : `reaproveitando template existente ("${scheduleTemplate.value.name}")`,
    });

    const sheet = page.locator('[data-slot="sheet-content"]');
    const createBtn = page.getByRole("button", { name: "Criar escala" });
    const addMinBtn = page.getByRole("button", { name: "Adicionar ministério" });
    const volunteerBtn = page.getByRole("button", { name: /Adicionar voluntário/ }).first();

    // ── Celebrações → aba Próximas ──
    await test.step("aba Próximas lista instâncias com o badge de escala", async () => {
      await page.goto("/celebracoes", { waitUntil: "domcontentloaded" });
      await selectTab(page, "Próximas");

      const scheduleBadge = page
        .getByRole("button", { name: /Escala( publicada| rascunho| arquivada)?$|Sem escala/ })
        .first();
      await expect(scheduleBadge, "seed sem instâncias?").toBeVisible();
      await shot(page, "01-proximas");

      // ── Abre a escala ──
      await scheduleBadge.click();
    });

    await test.step("painel de escala abre", async () => {
      await expect(sheet).toBeVisible();
    });

    // Estado inicial: ou oferece criar, ou já mostra a escala. `locator.or()`
    // substitui o `waitForAny` caseiro — o auto-retry do `expect` faz a espera,
    // sem sondagem manual nem tempo fixo.
    await expect(
      createBtn.or(addMinBtn),
      "painel não chegou a um estado conhecido"
    ).toBeVisible();

    if (await createBtn.count()) {
      await test.step("instância sem escala oferece 'Criar escala'", async () => {
        await expect(createBtn).toBeVisible();
        await shot(page, "02-sem-escala");
      });

      await test.step("escala criada e o painel passa a oferecer 'Adicionar ministério'", async () => {
        await createBtn.click();
        await expect(addMinBtn).toBeVisible();
      });
    } else {
      await test.step("instância já tem escala; painel mostra os ministérios", async () => {
        await expect(addMinBtn).toBeVisible();
      });
    }
    await shot(page, "03-escala");

    // ── Regressão visual: o Sheet posiciona o botão de fechar em
    // `absolute top-3 right-3`; o badge de status fica no mesmo canto e já se
    // sobrepôs a ele. Comparação de bounding boxes porque é colisão de layout,
    // não de estilo. ──
    await test.step("botão de fechar não colide com o badge de status", async () => {
      const closeBtn = sheet.locator('[data-slot="sheet-close"]');
      const statusBadge = sheet
        .locator("span", { hasText: /^(Rascunho|Publicada|Arquivada)$/ })
        .first();
      await expect(closeBtn).toBeVisible();
      await expect(statusBadge).toBeVisible();

      const c = await closeBtn.boundingBox();
      const b = await statusBadge.boundingBox();
      expect(c, "botão de fechar sem bounding box").not.toBeNull();
      expect(b, "badge de status sem bounding box").not.toBeNull();
      const overlap =
        c!.x < b!.x + b!.width &&
        b!.x < c!.x + c!.width &&
        c!.y < b!.y + b!.height &&
        b!.y < c!.y + c!.height;
      expect(overlap, `fechar ${JSON.stringify(c)} vs badge ${JSON.stringify(b)}`).toBe(false);
    });

    // ── Aplicar template ──
    await test.step("aplicar template preenche os ministérios da escala", async () => {
      const tplSelect = page.locator("#sched-tpl");
      // Sem timeout curto aqui: contra produção a API pode estar em cold start
      // do free tier, e 8s davam falso negativo. Usa o orçamento padrão de
      // `expect`, que é o mesmo do resto da suíte.
      await expect(tplSelect, "seletor de template não apareceu no painel").toBeVisible();
      await tplSelect.selectOption({ index: 1 });
      await page.getByRole("button", { name: "Aplicar", exact: true }).click();
      await expect(
        volunteerBtn,
        "template aplicado não trouxe ministérios para a escala"
      ).toBeVisible();
      await shot(page, "07-template-aplicado");
    });

    // ── Adiciona um ministério ──
    await addMinBtn.click();
    const minSelect = page.locator("#sched-min");
    await expect(minSelect).toBeVisible();

    if ((await minSelect.locator("option").count()) > 1) {
      await test.step("ministério adicionado à escala", async () => {
        await minSelect.selectOption({ index: 1 });
        await page.locator("#sched-slots").fill("2");
        await page.getByRole("button", { name: "Adicionar", exact: true }).click();
        await expect(
          volunteerBtn,
          "ministério não apareceu na escala após adicionar"
        ).toBeVisible();
        await shot(page, "04-ministerio-adicionado");
      });

      // ── Seletor de voluntários ──
      await test.step("seletor de voluntários carrega a disponibilidade do ministério", async () => {
        await volunteerBtn.click();
        // Ou o painel explica por que a lista está vazia, ou lista nomes
        // clicáveis. Qualquer um dos dois é "carregou".
        const explained = sheet
          .getByText(/Nenhum voluntário vinculado|já escalado|indisponível/)
          .first();
        await expect(
          explained.or(sheet.locator("button").first()),
          "seletor de voluntários não renderizou"
        ).toBeVisible();
        await shot(page, "05-seletor-voluntarios");
      });
    } else {
      await test.step("todos os ministérios já estão na escala (select sem opções)", async () => {
        await expect(minSelect.locator("option")).toHaveCount(1);
      });
    }

    // ── Indisponibilidade ──
    const dayBtn = page.getByRole("button", { name: /^\d+ de \w+$/ }).first();

    await test.step("aba Indisponibilidade renderiza o calendário do mês", async () => {
      await page.goto("/voluntarios", { waitUntil: "domcontentloaded" });
      await selectTab(page, "Indisponibilidade");
      await expect(page.locator("#unav-month")).toBeVisible();
      await expect(dayBtn, "calendário não renderizou").toBeVisible();
    });

    const bgBefore = await dayBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
    await dayBtn.click();

    await test.step("clicar num dia marca a indisponibilidade (aria-pressed)", async () => {
      await expect(dayBtn).toHaveAttribute("aria-pressed", "true");
    });

    await test.step("dia marcado fica destacado", async () => {
      // O contador dizer "1 dia marcado" não garante que o dia ficou visível
      // como marcado: o destaque é a única affordance na grade.
      //
      // A grade usa `transition-colors`, e ler o estilo logo após o clique pega
      // a cor no meio da interpolação — o que já me fez tomar uma animação em
      // curso por um destaque quase invisível. `toHaveCSS` retenta até a cor
      // estabilizar, e continuamos exigindo cor OPACA: `rgb(...)` casa, mas
      // `rgba(..., 0.x)` (interpolação em andamento) não.
      await expect(dayBtn, "destaque do dia ficou translúcido").toHaveCSS(
        "background-color",
        /^rgb\(/
      );
      const bgAfter = await dayBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(bgAfter, `dia marcado não mudou de cor (permaneceu ${bgAfter})`).not.toBe(bgBefore);
      await shot(page, "06-indisponibilidade");
    });

    // ── Erros de rede e de console ──
    await test.step("nenhuma resposta de erro inesperada", async () => {
      const unexpected = unexpectedHttp(errorLog);
      expect(unexpected.join(" | ")).toBe("");
    });

    await test.step("nenhum erro de JavaScript", async () => {
      const real = realConsoleErrors(errorLog);
      expect(real.join(" | ")).toBe("");
    });
  });
});
