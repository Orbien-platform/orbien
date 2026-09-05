/**
 * Smoke do site institucional — terceiro item da Fase 13 de docs/TESTES.md.
 *
 * O site é 100% estático: nenhum `fetch`, nenhum `route.ts` de dados, nenhum
 * `<form>`. Isso define o que um smoke aqui pode afirmar de útil, e o que não
 * pode. O que ele afirma é o que quebra de verdade em site estático de Next:
 *
 *   - a rota **existe e responde 200** (page renomeada, pasta movida, `export`
 *     esquecido — tudo aparece como 404 aqui);
 *   - **header e footer renderizam** na rota (são importados por página, não
 *     pelo `layout.tsx`, então esquecer um deles em página nova não quebra
 *     build nenhum — só a navegação);
 *   - o **404 é 404** de verdade, e não uma página 200 com texto de erro, que é
 *     o que buscador indexa por engano;
 *   - os quatro endpoints gerados (`icon`, `apple-icon`, `robots.txt`,
 *     `sitemap.xml`) respondem com o content-type certo.
 *
 * Sobre a contagem: docs/TESTES.md fala em "18 rotas". 18 é o número de
 * arquivos em `src/app/`, que não é o número de endpoints HTTP — a conta
 * inclui `layout.tsx`, `globals.css` e o `favicon.ico`, e trata o `not-found`
 * como rota de 200. Os endpoints reais são 12 páginas navegáveis + 4 gerados,
 * mais o 404. É essa lista que está abaixo, e é ela que vale.
 *
 * Uso: E2E_BASE_URL=http://localhost:3002 npx playwright test -c apps/site
 */

import { expect, test } from "@playwright/test";

/**
 * As 12 páginas navegáveis, com um texto próprio de cada uma.
 *
 * O texto existe para separar "a rota respondeu 200" de "a rota respondeu 200
 * com a página certa": sem ele, duas rotas apontando para o mesmo componente
 * passariam iguais.
 */
const PAGINAS = [
  { path: "/", texto: "Gestão que serve" },
  { path: "/precos", texto: "Preços" },
  { path: "/sem-cnpj", texto: "CNPJ" },
  { path: "/sobre", texto: "Sobre" },
  { path: "/contato", texto: "Contato" },
  { path: "/lgpd", texto: "LGPD" },
  { path: "/login", texto: "Orbien" },
  { path: "/funcionalidades", texto: "Funcionalidades" },
  { path: "/funcionalidades/membros", texto: "Membros" },
  { path: "/funcionalidades/financeiro", texto: "Financeiro" },
  { path: "/funcionalidades/conteudos", texto: "Conteúdos" },
  { path: "/funcionalidades/pequenos-grupos", texto: "grupos" },
] as const;

/** Os endpoints que o Next gera a partir de código, não de JSX de página. */
const GERADOS = [
  { path: "/robots.txt", contentType: /text\/plain/ },
  { path: "/sitemap.xml", contentType: /(xml)/ },
  { path: "/icon", contentType: /image\// },
  { path: "/apple-icon", contentType: /image\// },
] as const;

test.describe("site — smoke", () => {
  for (const { path, texto } of PAGINAS) {
    test(`${path} responde 200, com header e footer`, async ({ page }) => {
      const res = await page.goto(path, { waitUntil: "domcontentloaded" });

      expect(res, `${path} não respondeu`).not.toBeNull();
      expect(res!.status(), `${path} não respondeu 200`).toBe(200);

      // `<header>`/`<footer>` semânticos: a asserção é por papel, não por
      // classe de estilo, para não quebrar em refatoração de Tailwind.
      await expect(page.getByRole("banner"), `${path} sem header`).toBeVisible();
      await expect(page.getByRole("contentinfo"), `${path} sem footer`).toBeVisible();

      // Navegação principal do header — o que faz a página ser navegável e não
      // só renderizável.
      await expect(
        page.getByRole("navigation", { name: "Principal" }),
        `${path} sem a navegação principal`,
      ).toBeAttached();

      await expect(
        page.getByText(texto, { exact: false }).first(),
        `${path} respondeu 200 mas sem o conteúdo esperado`,
      ).toBeVisible();
    });
  }

  test("a home tem o destino da âncora #waitlist", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // O CTA de waitlist é `href="#waitlist"`, e o alvo (`id="waitlist"`) vive
    // em `components/home/FinalCta.tsx`. Só a home o tem — nas outras páginas
    // o mesmo CTA aparece sem destino na própria página. Ver o relatório da
    // Fase 13 em docs/TESTES.md: é um achado registrado, não um teste
    // afrouxado, e por isso a asserção é sobre a home e diz que é sobre a home.
    await expect(
      page.locator("#waitlist"),
      "a home perdeu o destino da âncora #waitlist — todo CTA de waitlist do site fica sem alvo",
    ).toBeAttached();

    const cta = page.locator('a[href="#waitlist"]').first();
    await expect(cta, "a home não tem CTA apontando para #waitlist").toBeVisible();
  });

  test("rota inexistente responde 404, não 200", async ({ page }) => {
    // Página de erro servida com 200 é indexada como conteúdo. O `not-found`
    // do Next responde 404 — este teste é o que impede alguém trocá-lo por uma
    // page comum sem perceber.
    const res = await page.goto(`/rota-que-nao-existe-${Date.now()}`, {
      waitUntil: "domcontentloaded",
    });

    expect(res).not.toBeNull();
    expect(res!.status(), "rota inexistente não respondeu 404").toBe(404);
    // O `not-found.tsx` também traz header e footer: quem cai nele tem que
    // conseguir sair dele.
    await expect(page.getByRole("banner"), "o 404 ficou sem header").toBeVisible();
    await expect(page.getByRole("contentinfo"), "o 404 ficou sem footer").toBeVisible();
  });

  for (const { path, contentType } of GERADOS) {
    test(`${path} responde com o content-type certo`, async ({ request }) => {
      // Via `request` e não `page`: são recursos, não documentos. Asserir o
      // content-type é suficiente — comparar pixel de ícone gerado por
      // `ImageResponse` seria refém da versão do satori (ver Fase 12).
      const res = await request.get(path);
      expect(res.status(), `${path} não respondeu 200`).toBe(200);
      expect(
        res.headers()["content-type"] ?? "",
        `${path} respondeu com content-type inesperado`,
      ).toMatch(contentType);
    });
  }
});
