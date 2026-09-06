import { describe, expect, it } from "vitest";
import sitemap from "./sitemap";

const PUBLIC_ROUTES = [
  "/",
  "/funcionalidades",
  "/funcionalidades/membros",
  "/funcionalidades/financeiro",
  "/funcionalidades/pequenos-grupos",
  "/funcionalidades/conteudos",
  "/precos",
  "/sem-cnpj",
  "/sobre",
  "/contato",
  "/lgpd",
];

describe("sitemap", () => {
  it("anuncia exatamente as rotas públicas do site", () => {
    const paths = sitemap().map((entry) => new URL(entry.url).pathname);

    expect(paths).toEqual(PUBLIC_ROUTES);
  });

  it("usa o domínio de produção em todas as entradas", () => {
    for (const entry of sitemap()) {
      expect(entry.url.startsWith("https://useorbien.com.br")).toBe(true);
    }
  });

  it("não anuncia o /login, que é tela de acesso e não conteúdo", () => {
    const paths = sitemap().map((entry) => new URL(entry.url).pathname);

    expect(paths).not.toContain("/login");
  });

  it("dá prioridade máxima à home e prioridade decrescente ao resto", () => {
    const [home, ...rest] = sitemap();

    expect(home.priority).toBe(1);
    for (const entry of rest) {
      expect(entry.priority).toBeLessThan(1);
      expect(entry.priority).toBeGreaterThan(0);
    }
  });

  it("preenche lastModified com a data do build", () => {
    for (const entry of sitemap()) {
      expect(entry.lastModified).toBeInstanceOf(Date);
    }
  });

  it("declara uma frequência de mudança em toda entrada", () => {
    for (const entry of sitemap()) {
      expect(entry.changeFrequency).toBeTruthy();
    }
  });
});
