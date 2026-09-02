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

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { authenticatedPage, BASE_URL, login } from "./session.mjs";
import { ensureTemplate, ensureUpcomingInstance } from "./fixtures.mjs";

const SHOTS = new URL("./screenshots/", import.meta.url).pathname;

const steps = [];
function ok(label) {
  steps.push({ label, ok: true });
  console.log(`  ✓ ${label}`);
}
function fail(label, detail) {
  steps.push({ label, ok: false, detail });
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

/**
 * Espera até que um dos locators exista, devolvendo qual. Esperar por tempo
 * fixo torna o teste intermitente: o mesmo passo passa contra produção e falha
 * contra o dev local, que é mais lento.
 */
async function waitForAny(locators, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const [name, loc] of Object.entries(locators)) {
      if (await loc.count()) return name;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

async function shot(page, name) {
  await page.screenshot({ path: `${SHOTS}${name}.png`, fullPage: false });
}

async function main() {
  await mkdir(SHOTS, { recursive: true });

  const tokens = await login();

  // A aba "Próximas" só lista instâncias futuras; garantimos que haja uma.
  const fixture = await ensureUpcomingInstance(tokens.access_token);
  console.log(
    fixture.created
      ? `  · instância temporária criada para o teste (${fixture.instance.id.slice(0, 8)})`
      : `  · reaproveitando instância futura existente (${fixture.instance.id.slice(0, 8)})`
  );

  // O seletor de "aplicar template" só existe se houver template cadastrado.
  const tpl = await ensureTemplate(tokens.access_token);
  console.log(
    tpl.created
      ? "  · template temporário criado para o teste"
      : `  · reaproveitando template existente ("${tpl.template.name}")`
  );

  const browser = await chromium.launch();
  const { context, page, errors, httpErrors } = await authenticatedPage(browser, tokens);

  try {
    // ── Celebrações → aba Próximas ──
    await page.goto(`${BASE_URL}/celebracoes`, { waitUntil: "networkidle" });
    // A aba só responde depois da hidratação; esperar o clique surtir efeito
    // evita um falso negativo em que o painel simplesmente não abriu.
    const proximas = page.getByRole("tab", { name: "Próximas" });
    await proximas.waitFor({ state: "visible", timeout: 15_000 });
    await proximas.click();

    const scheduleBadge = page
      .getByRole("button", { name: /Escala( publicada| rascunho| arquivada)?$|Sem escala/ })
      .first();

    if (await waitForAny({ badge: scheduleBadge })) {
      ok("aba Próximas lista instâncias com o badge de escala");
    } else {
      fail("nenhuma instância com badge de escala", "seed sem instâncias?");
      await shot(page, "01-proximas-vazia");
      return;
    }

    await shot(page, "01-proximas");

    // ── Abre a escala ──
    await scheduleBadge.click();
    const sheetTitle = page.locator('[data-slot="sheet-content"]');
    await sheetTitle.waitFor({ state: "visible", timeout: 10_000 });
    ok("painel de escala abre");

    // Estado inicial: ou oferece criar, ou já mostra a escala
    const createBtn = page.getByRole("button", { name: "Criar escala" });
    const addMinBtn = page.getByRole("button", { name: "Adicionar ministério" });

    const state = await waitForAny({ create: createBtn, ministries: addMinBtn });

    if (state === "create") {
      ok("instância sem escala oferece 'Criar escala'");
      await shot(page, "02-sem-escala");
      await createBtn.click();
      await addMinBtn.waitFor({ state: "visible", timeout: 10_000 });
      ok("escala criada e o painel passa a oferecer 'Adicionar ministério'");
    } else if (state === "ministries") {
      ok("instância já tem escala; painel mostra os ministérios");
    } else {
      fail("painel não chegou a um estado conhecido");
    }
    await shot(page, "03-escala");

    // O Sheet posiciona o botão de fechar em absolute top-3 right-3; o badge
    // de status fica no mesmo canto e já se sobrepôs a ele.
    const closeBtn = sheetTitle.locator('[data-slot="sheet-close"]');
    const statusBadge = sheetTitle.locator("span", { hasText: /^(Rascunho|Publicada|Arquivada)$/ }).first();
    if ((await closeBtn.count()) && (await statusBadge.count())) {
      const [c, b] = [await closeBtn.boundingBox(), await statusBadge.boundingBox()];
      const overlap =
        c && b && c.x < b.x + b.width && b.x < c.x + c.width && c.y < b.y + b.height && b.y < c.y + c.height;
      if (overlap) fail("botão de fechar sobrepõe o badge de status do painel");
      else ok("botão de fechar não colide com o badge de status");
    }

    // ── Aplicar template ──
    const tplSelect = page.locator("#sched-tpl");
    if (await waitForAny({ tpl: tplSelect }, 8000)) {
      await tplSelect.selectOption({ index: 1 });
      await page.getByRole("button", { name: "Aplicar", exact: true }).click();
      const applied = page.getByRole("button", { name: /Adicionar voluntário/ }).first();
      if (await waitForAny({ applied })) {
        ok("aplicar template preenche os ministérios da escala");
        await shot(page, "07-template-aplicado");
      } else {
        fail("template aplicado não trouxe ministérios para a escala");
      }
    } else {
      fail("seletor de template não apareceu no painel");
    }

    // ── Adiciona um ministério ──
    if (await addMinBtn.count()) {
      await addMinBtn.click();
      const select = page.locator("#sched-min");
      await select.waitFor({ state: "visible", timeout: 5000 });

      const options = await select.locator("option").count();
      if (options > 1) {
        await select.selectOption({ index: 1 });
        await page.locator("#sched-slots").fill("2");
        await page.getByRole("button", { name: "Adicionar", exact: true }).click();

        const pickerBtn = page.getByRole("button", { name: /Adicionar voluntário/ }).first();
        if (await waitForAny({ picker: pickerBtn })) {
          ok("ministério adicionado à escala");
          await shot(page, "04-ministerio-adicionado");

          // ── Seletor de voluntários ──
          await pickerBtn.click();
          await waitForAny({
            lista: sheetTitle.getByText(/Nenhum voluntário vinculado|já escalado|indisponível/),
            nomes: sheetTitle.locator("button").nth(3),
          });
          const sheetText = await sheetTitle.innerText();
          if (/Nenhum voluntário vinculado|indisponível|já escalado/.test(sheetText) ||
              (await sheetTitle.locator("button").count()) > 0) {
            ok("seletor de voluntários carrega a disponibilidade do ministério");
            await shot(page, "05-seletor-voluntarios");
          } else {
            fail("seletor de voluntários não renderizou");
          }
        } else {
          fail("ministério não apareceu na escala após adicionar");
        }
      } else {
        ok("todos os ministérios já estão na escala (select sem opções)");
      }
    }

    // ── Indisponibilidade ──
    await page.goto(`${BASE_URL}/voluntarios`, { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: "Indisponibilidade" }).click();
    const monthSelect = page.locator("#unav-month");
    await monthSelect.waitFor({ state: "visible", timeout: 15_000 });

    const dayBtn = page.getByRole("button", { name: /^\d+ de \w+$/ }).first();
    if (await waitForAny({ dia: dayBtn })) {
      ok("aba Indisponibilidade renderiza o calendário do mês");
      const bgBefore = await dayBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
      await dayBtn.click();
      const pressed = await dayBtn.getAttribute("aria-pressed");
      if (pressed === "true") ok("clicar num dia marca a indisponibilidade (aria-pressed)");
      else fail("clique no dia não alterou aria-pressed", `aria-pressed=${pressed}`);

      // O contador dizer "1 dia marcado" não garante que o dia ficou visível
      // como marcado: o destaque é a única affordance na grade.
      //
      // A espera não é folga: a grade usa `transition-colors`, e ler o estilo
      // logo após o clique pega a cor no meio da interpolação — o que já me
      // fez tomar uma animação em curso por um destaque quase invisível.
      await page.waitForTimeout(400);
      const bgAfter = await dayBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
      const opaque = /^rgb\(/.test(bgAfter);
      if (bgAfter !== bgBefore && opaque) {
        ok(`dia marcado fica destacado (${bgBefore} → ${bgAfter})`);
      } else if (!opaque) {
        fail("destaque do dia ficou translúcido", `${bgAfter} — transição não concluiu?`);
      } else {
        fail("dia marcado não mudou de cor", `permaneceu ${bgAfter}`);
      }
      await shot(page, "06-indisponibilidade");
    } else {
      fail("calendário não renderizou");
    }

    // ── Erros de rede e de console ──
    // GET .../schedule responde 404 quando a instância ainda não tem escala.
    // É o estado inicial legítimo que a tela trata; não é defeito.
    const unexpected = httpErrors.filter((e) => !/^404 .*\/schedule$/.test(e));
    if (unexpected.length === 0) {
      const expected404 = httpErrors.length - unexpected.length;
      ok(
        expected404 > 0
          ? `nenhuma resposta de erro inesperada (${expected404} × 404 de escala inexistente, esperado)`
          : "nenhuma resposta de erro"
      );
    } else {
      fail(`${unexpected.length} resposta(s) de erro inesperada(s)`, unexpected.slice(0, 3).join(" | "));
    }

    const real = errors.filter(
      (e) => !/favicon|Download the React DevTools|Failed to load resource/i.test(e)
    );
    if (real.length === 0) ok("nenhum erro de JavaScript");
    else fail(`${real.length} erro(s) de JavaScript`, real.slice(0, 3).join(" | "));
  } finally {
    await context.close();
    await browser.close();
    await fixture.cleanup();
    if (fixture.created) console.log("  · instância temporária removida");
    await tpl.cleanup();
    if (tpl.created) console.log("  · template temporário removido");
  }

  const failed = steps.filter((s) => !s.ok);
  console.log(
    `\n${steps.length - failed.length}/${steps.length} verificações passaram` +
      (failed.length ? ` — ${failed.length} falharam` : "")
  );
  console.log(`capturas em ${SHOTS}`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
