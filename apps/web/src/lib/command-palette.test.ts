import { describe, expect, it } from "vitest";
import { filterEntries, normalizeSearch, paletteEntries } from "./command-palette";

const ALL = { areas: null as string[] | null };

describe("paletteEntries", () => {
  it("lista as telas do menu na ordem dele e o Perfil por último", () => {
    const entries = paletteEntries(ALL, "Grupos");
    expect(entries[0]).toMatchObject({ href: "/dashboard", label: "Início", section: null });
    expect(entries[entries.length - 1]).toMatchObject({ href: "/perfil", label: "Perfil" });
  });

  it("usa o termo da igreja no lugar de Grupos", () => {
    const entries = paletteEntries(ALL, "Células");
    expect(entries.find((e) => e.href === "/grupos")?.label).toBe("Células");
  });

  it("não oferece o que o papel não alcança", () => {
    const entries = paletteEntries({ areas: ["persons"] }, "Grupos");
    const hrefs = entries.map((e) => e.href);
    expect(hrefs).toContain("/pessoas");
    expect(hrefs).not.toContain("/financeiro");
  });

  it("marca como Premium a área que o plano barra e o papel alcançaria", () => {
    const entries = paletteEntries({ areas: ["persons"], upgrade_areas: ["financial"] }, "Grupos");
    expect(entries.find((e) => e.href === "/financeiro")?.upgrade).toBe(true);
    expect(entries.find((e) => e.href === "/pessoas")?.upgrade).toBe(false);
  });

  it("sem sessão, só o Perfil", () => {
    expect(paletteEntries(null, "Grupos").map((e) => e.href)).toEqual(["/perfil"]);
  });
});

describe("normalizeSearch", () => {
  it("tira acento e caixa", () => {
    expect(normalizeSearch("  Celebrações ")).toBe("celebracoes");
  });
});

describe("filterEntries", () => {
  const entries = paletteEntries(ALL, "Grupos");

  it("sem busca devolve tudo", () => {
    expect(filterEntries(entries, "  ")).toHaveLength(entries.length);
  });

  it("acha sem acento", () => {
    expect(filterEntries(entries, "celebracoes").map((e) => e.href)).toEqual(["/celebracoes"]);
  });

  it("quem começa pelo termo vem antes de quem só o contém", () => {
    const result = filterEntries(entries, "pessoas").map((e) => e.href);
    // "Pessoas" (rótulo) antes dos itens da seção Pessoas que só a citam.
    expect(result[0]).toBe("/pessoas");
    expect(result).toContain("/pessoas/indicadores");
  });

  it("acha pelo nome da seção", () => {
    const result = filterEntries(entries, "financeiro").map((e) => e.href);
    expect(result).toContain("/financeiro");
  });

  it("sem resultado devolve lista vazia", () => {
    expect(filterEntries(entries, "zzzz")).toEqual([]);
  });
});
