/**
 * Percorre a aba "Templates" em Celebrações: criar pelo formulário, ver na
 * lista, editar e excluir. O template criado aqui é removido pelo próprio
 * teste, pela UI — o que também exercita a exclusão.
 *
 * Uso: E2E_EMAIL=... E2E_PASSWORD=... E2E_TENANT=... node e2e/templates.mjs
 */

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { authenticatedPage, BASE_URL, login } from "./session.mjs";

const SHOTS = new URL("./screenshots/", import.meta.url).pathname;
const NAME = `E2E template ${Date.now()}`;

const steps = [];
const ok = (l) => (steps.push({ l, ok: true }), console.log(`  ✓ ${l}`));
const fail = (l, d) => (steps.push({ l, ok: false }), console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`));

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

async function main() {
  await mkdir(SHOTS, { recursive: true });

  const tokens = await login();
  const browser = await chromium.launch();
  const { context, page, errors, httpErrors } = await authenticatedPage(browser, tokens);

  let createdViaUi = false;

  try {
    await page.goto(`${BASE_URL}/celebracoes`, { waitUntil: "networkidle" });
    const tab = page.getByRole("tab", { name: "Templates" });
    await tab.waitFor({ state: "visible", timeout: 15_000 });
    await tab.click();

    const newBtn = page.getByRole("button", { name: "Novo template" });
    if (await waitForAny({ novo: newBtn })) ok("aba Templates abre e oferece 'Novo template'");
    else return fail("aba Templates não renderizou");
    await page.screenshot({ path: `${SHOTS}10-templates.png` });

    // ── Criar ──
    await newBtn.click();
    const nameInput = page.locator("#tpl-name");
    await nameInput.waitFor({ state: "visible", timeout: 10_000 });
    ok("formulário de template abre");

    await nameInput.fill(NAME);
    await page.locator("#tpl-desc").fill("criado pelo teste de e2e");

    // O select nasce só com o placeholder e é preenchido quando a lista de
    // ministérios chega; esperar por opções evita confundir carregamento com
    // ausência de dados.
    const minSelect = page.getByLabel("Ministério 1");
    const populated = await waitForAny(
      { pronto: minSelect.locator("option").nth(1) },
      15_000
    );
    if (!populated) return fail("select de ministérios não foi preenchido");
    ok("select de ministérios carrega as opções");
    await minSelect.selectOption({ index: 1 });
    await page.getByLabel("Vagas 1").fill("3");

    // Validação: nome vazio deve barrar antes de chamar a API
    await nameInput.fill("");
    await page.getByRole("button", { name: "Criar", exact: true }).click();
    if (await waitForAny({ erro: page.getByText("Dê um nome ao template.") }, 4000)) {
      ok("formulário barra criação sem nome");
    } else {
      fail("formulário não validou nome vazio");
    }
    await nameInput.fill(NAME);
    await page.screenshot({ path: `${SHOTS}11-form-template.png` });

    await page.getByRole("button", { name: "Criar", exact: true }).click();
    const card = page.getByText(NAME, { exact: true });
    if (await waitForAny({ card })) {
      createdViaUi = true;
      ok("template criado aparece na lista");
    } else {
      return fail("template não apareceu na lista após criar");
    }
    await page.screenshot({ path: `${SHOTS}12-template-criado.png` });

    // O componente Button tem variant "default" com fundo preenchido. Usá-lo
    // para botão de ícone sem classe de fundo pinta um quadrado escuro, que foi
    // exatamente o que aconteceu aqui — a base usa <button> puro nesses casos.
    const iconBtn = page.getByRole("button", { name: `Excluir ${NAME}` });
    const iconBg = await iconBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
    if (/rgba\(0, 0, 0, 0\)|transparent/.test(iconBg)) {
      ok("botões de ícone não têm fundo preenchido");
    } else {
      fail("botão de ícone com fundo preenchido", `${iconBg} — variant default do Button?`);
    }

    // ── Editar ──
    await page.getByRole("button", { name: `Editar ${NAME}` }).click();
    const descInput = page.locator("#tpl-desc");
    await descInput.waitFor({ state: "visible", timeout: 10_000 });
    await descInput.fill("descrição editada");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    if (await waitForAny({ edited: page.getByText("descrição editada", { exact: true }) })) {
      ok("edição do template reflete na lista");
    } else {
      fail("edição não refletiu na lista");
    }

    // ── Excluir ──
    await page.getByRole("button", { name: `Excluir ${NAME}` }).click();
    const deadline = Date.now() + 20_000;
    let gone = false;
    while (Date.now() < deadline) {
      if ((await page.getByText(NAME, { exact: true }).count()) === 0) {
        gone = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    if (gone) {
      createdViaUi = false;
      ok("template excluído sai da lista");
    } else {
      fail("template continua na lista após excluir");
    }

    // ── Erros ──
    const unexpected = httpErrors.filter((e) => !/^404 .*\/schedule$/.test(e));
    if (unexpected.length === 0) ok("nenhuma resposta de erro inesperada");
    else fail(`${unexpected.length} resposta(s) de erro`, unexpected.slice(0, 3).join(" | "));

    const real = errors.filter(
      (e) => !/favicon|Download the React DevTools|Failed to load resource/i.test(e)
    );
    if (real.length === 0) ok("nenhum erro de JavaScript");
    else fail(`${real.length} erro(s) de JavaScript`, real.slice(0, 2).join(" | "));
  } finally {
    // Rede de segurança: se o teste falhou depois de criar, não deixa lixo.
    if (createdViaUi) {
      const list = await fetch(
        `${process.env.E2E_API_URL ?? "http://localhost:3000/api"}/celebrations/schedule-templates`,
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      ).then((r) => r.json());
      const orphan = list.find?.((t) => t.name === NAME);
      if (orphan) {
        await fetch(
          `${process.env.E2E_API_URL ?? "http://localhost:3000/api"}/celebrations/schedule-templates/${orphan.id}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${tokens.access_token}` } }
        );
        console.log("  · template órfão removido");
      }
    }
    await context.close();
    await browser.close();
  }

  const failed = steps.filter((s) => !s.ok);
  console.log(
    `\n${steps.length - failed.length}/${steps.length} verificações passaram` +
      (failed.length ? ` — ${failed.length} falharam` : "")
  );
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
