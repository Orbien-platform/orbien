import { describe, expect, it } from "vitest";
import { canAccessRoute, NAV_READ_ROLES } from "./permissions";

const subject = (roles: string[], support = false) => ({
  roles,
  support_session: support,
});

describe("canAccessRoute", () => {
  it("libera a rota quando o papel está na lista de leitura", () => {
    expect(canAccessRoute(subject(["treasurer"]), "/financeiro")).toBe(true);
    expect(canAccessRoute(subject(["cell_leader"]), "/grupos")).toBe(true);
    expect(canAccessRoute(subject(["ministry_leader"]), "/celebracoes")).toBe(true);
  });

  it("nega quando nenhum dos papéis lê aquela área", () => {
    expect(canAccessRoute(subject(["volunteer"]), "/financeiro")).toBe(false);
    expect(canAccessRoute(subject(["member"]), "/pessoas")).toBe(false);
    expect(canAccessRoute(subject(["treasurer"]), "/celebracoes")).toBe(false);
  });

  it("basta um papel entre vários", () => {
    expect(canAccessRoute(subject(["volunteer", "treasurer"]), "/financeiro")).toBe(true);
  });

  it("rota fora do mapa é aberta a qualquer autenticado", () => {
    // `/dashboard` e `/configuracoes` não são recortados por papel — ver o
    // cabeçalho de `permissions.ts`.
    expect(canAccessRoute(subject(["volunteer"]), "/dashboard")).toBe(true);
    expect(canAccessRoute(subject(["volunteer"]), "/configuracoes")).toBe(true);
  });

  it("sessão de suporte passa em tudo, como no RolesGuard", () => {
    expect(canAccessRoute(subject([], true), "/financeiro")).toBe(true);
    expect(canAccessRoute(subject([], true), "/pessoas")).toBe(true);
  });

  it("sem sessão, nada", () => {
    expect(canAccessRoute(null, "/dashboard")).toBe(false);
    expect(canAccessRoute(undefined, "/financeiro")).toBe(false);
  });

  it("não cita papel que não existe na tabela `roles` da API", () => {
    // A lista de papéis do produto, em `prisma/seed.ts`. Um papel escrito
    // errado aqui vira link que nunca aparece — falha silenciosa.
    const KNOWN = [
      "platform_support",
      "tenant_admin",
      "admin_congregation",
      "pastor",
      "secretary",
      "treasurer",
      "cell_leader",
      "ministry_leader",
      "volunteer",
      "member",
    ];

    for (const [route, roles] of Object.entries(NAV_READ_ROLES)) {
      for (const role of roles) {
        expect(KNOWN, `${route} cita "${role}"`).toContain(role);
      }
    }
  });
});
