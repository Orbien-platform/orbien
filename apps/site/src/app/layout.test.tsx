import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * `next/font/google` só existe como transformação do compilador do Next — o
 * módulo importado fora do build não expõe os loaders, então chamar
 * `DM_Sans()` estoura. O mock devolve o mesmo contrato usado pelo layout
 * (um objeto com `variable`), o que basta para verificar que as duas
 * variáveis de fonte chegam ao `<html>`.
 */
vi.mock("next/font/google", () => ({
  DM_Sans: () => ({ variable: "--font-dm-sans-stub" }),
  DM_Mono: () => ({ variable: "--font-dm-mono-stub" }),
}));

// `<html>`/`<body>` não podem ser montados dentro do container do jsdom;
// renderizar para string é o jeito de asserir os atributos da raiz.
const { default: RootLayout, metadata } = await import("./layout");

describe("RootLayout", () => {
  it("declara o documento em pt-BR", () => {
    const html = renderToStaticMarkup(<RootLayout>conteúdo</RootLayout>);

    expect(html).toContain('lang="pt-BR"');
  });

  it("aplica as duas variáveis de fonte na raiz", () => {
    const html = renderToStaticMarkup(<RootLayout>conteúdo</RootLayout>);

    expect(html).toContain("--font-dm-sans-stub");
    expect(html).toContain("--font-dm-mono-stub");
  });

  it("renderiza os filhos dentro do body", () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <p>página</p>
      </RootLayout>,
    );

    expect(html).toMatch(/<body[^>]*>[\s\S]*<p>página<\/p>[\s\S]*<\/body>/);
  });

  it("expõe o metadataBase e o template de título", () => {
    expect(metadata.metadataBase?.toString()).toBe("https://useorbien.com.br/");
    expect(metadata.title).toEqual({
      template: "%s — Orbien",
      default: "Orbien — Gestão que serve. Igreja que cresce.",
    });
    expect(metadata.description).toContain("igrejas de pequeno e médio porte");
  });
});
