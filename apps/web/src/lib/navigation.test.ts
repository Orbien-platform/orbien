import { describe, expect, it } from "vitest";
import { activeNavHref, findNavEntry, NAV_SECTIONS } from "./navigation";

describe("navegação", () => {
  it("lista Indicadores em Pessoas", () => {
    const pessoas = NAV_SECTIONS.find((s) => s.title === "Pessoas");
    expect(pessoas?.items.map((i) => i.href)).toEqual(["/pessoas", "/pessoas/indicadores"]);
  });

  it("o item mais específico vence: /pessoas/indicadores não acende Pessoas", () => {
    expect(activeNavHref("/pessoas/indicadores")).toBe("/pessoas/indicadores");
    expect(findNavEntry("/pessoas/indicadores")?.item.label).toBe("Indicadores");
  });

  it("uma sub-rota continua no item pai", () => {
    expect(activeNavHref("/pessoas/abc")).toBe("/pessoas");
    expect(findNavEntry("/celebracoes/x")?.section).toBe("Cultos e serviço");
  });

  it("Kids fica em Cultos e serviço e as sub-telas continuam nele", () => {
    const cultos = NAV_SECTIONS.find((s) => s.title === "Cultos e serviço");
    expect(cultos?.items.map((i) => i.href)).toContain("/kids");
    expect(findNavEntry("/kids/turmas")?.item.label).toBe("Kids");
    expect(activeNavHref("/kids/criancas")).toBe("/kids");
  });

  it("tela fora do menu não tem item ativo", () => {
    expect(activeNavHref("/perfil")).toBeNull();
    expect(findNavEntry("/perfil")).toBeNull();
  });
});
