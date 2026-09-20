import { describe, expect, it } from "vitest";
import robots from "./robots";
import sitemap from "./sitemap";

describe("robots", () => {
  it("libera o site inteiro para qualquer robô", () => {
    const [rule] = [robots().rules].flat();

    expect(rule).toMatchObject({ userAgent: "*", allow: "/" });
  });

  it("bloqueia o login e a API, que não são conteúdo indexável", () => {
    const [rule] = [robots().rules].flat();

    expect(rule?.disallow).toEqual(["/login", "/api/"]);
  });

  it("aponta para o sitemap no domínio de produção", () => {
    expect(robots().sitemap).toBe("https://useorbien.com/sitemap.xml");
  });

  it("não bloqueia nenhuma rota que o sitemap anuncia", () => {
    const disallowed = [robots().rules].flat().flatMap((r) => [r.disallow ?? []].flat());
    const announced = sitemap().map((entry) => new URL(entry.url).pathname);

    for (const path of announced) {
      expect(disallowed).not.toContain(path);
    }
  });
});
