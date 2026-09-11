import { describe, expect, it } from "vitest";
import { canAccessRoute, ROUTE_AREAS } from "./permissions";

const subject = (areas: string[] | null) => ({ areas });

describe("canAccessRoute", () => {
  it("libera a rota quando a API devolveu a área dela", () => {
    expect(canAccessRoute(subject(["financial"]), "/financeiro")).toBe(true);
    expect(canAccessRoute(subject(["small_groups"]), "/grupos")).toBe(true);
    expect(canAccessRoute(subject(["celebrations"]), "/celebracoes")).toBe(true);
  });

  it("nega quando a área não veio na resposta", () => {
    expect(canAccessRoute(subject(["content"]), "/financeiro")).toBe(false);
    expect(canAccessRoute(subject([]), "/pessoas")).toBe(false);
  });

  it("basta a área certa entre várias", () => {
    expect(canAccessRoute(subject(["content", "financial"]), "/financeiro")).toBe(true);
  });

  it("rota fora do mapa é aberta a qualquer autenticado", () => {
    // `/dashboard`, `/configuracoes` e `/repertorio` não são recortados por
    // papel — ver o cabeçalho de `permissions.ts`.
    expect(canAccessRoute(subject([]), "/dashboard")).toBe(true);
    expect(canAccessRoute(subject([]), "/configuracoes")).toBe(true);
    expect(canAccessRoute(subject([]), "/repertorio")).toBe(true);
  });

  it("`areas: null` (API não respondeu) desenha tudo, em vez de esconder tudo", () => {
    // A degradação é deliberada: link a mais leva a uma tela que responde
    // "sem acesso"; esconder a navegação travaria quem podia trabalhar.
    expect(canAccessRoute(subject(null), "/financeiro")).toBe(true);
    expect(canAccessRoute(subject(null), "/pessoas")).toBe(true);
  });

  it("sem sessão, nada", () => {
    expect(canAccessRoute(null, "/dashboard")).toBe(false);
    expect(canAccessRoute(undefined, "/financeiro")).toBe(false);
  });

  it("o mapa de rota só cita área que a API conhece", () => {
    // As áreas nascem em `apps/api/src/auth/product-areas.ts`. Nome errado
    // aqui vira link que nunca aparece — a mesma falha silenciosa que a
    // lista de papéis duplicada produzia, num alvo bem menor.
    const AREAS_DA_API = [
      "persons",
      "small_groups",
      "financial",
      "content",
      "volunteers",
      "celebrations",
    ];

    for (const [route, area] of Object.entries(ROUTE_AREAS)) {
      expect(AREAS_DA_API, `${route} cita "${area}"`).toContain(area);
    }
  });
});
