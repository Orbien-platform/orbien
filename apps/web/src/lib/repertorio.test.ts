import { describe, expect, it } from "vitest";
import { fmtLastPlayed, matchesSong, normalizeForSearch, songKey, type CatalogSong } from "./repertorio";

function song(overrides: Partial<CatalogSong> = {}): CatalogSong {
  return {
    id: "s1",
    title: "Grande é o Senhor",
    key: "D",
    key_alt: null,
    bpm: 80,
    link: null,
    youtube_link: null,
    spotify_link: null,
    cifra_club_link: null,
    notes: null,
    last_played_at: null,
    ...overrides,
  };
}

describe("fmtLastPlayed", () => {
  it("formata a data em pt-BR", () => {
    expect(fmtLastPlayed("2026-08-01T12:00:00.000Z")).toBe("01/08/2026");
  });

  it('devolve "nunca tocada" quando não há data', () => {
    expect(fmtLastPlayed(null)).toBe("nunca tocada");
  });
});

describe("normalizeForSearch", () => {
  it("baixa a caixa e remove os acentos", () => {
    expect(normalizeForSearch("Orações")).toBe("oracoes");
  });

  it("faz colidir a forma com acento e a sem acento", () => {
    expect(normalizeForSearch("Orações")).toBe(normalizeForSearch("oracoes"));
  });
});

describe("matchesSong", () => {
  it("casa por correspondência parcial no título", () => {
    expect(matchesSong(song({ title: "Grande é o Senhor" }), "grande")).toBe(true);
  });

  it("ignora diferença de caixa e de acento", () => {
    expect(matchesSong(song({ title: "Orações" }), "ORACOES")).toBe(true);
    expect(matchesSong(song({ title: "Oracoes" }), "orações")).toBe(true);
  });

  it("não casa quando o termo não está no título", () => {
    expect(matchesSong(song({ title: "Grande é o Senhor" }), "aleluia")).toBe(false);
  });

  it("casa com tudo quando o termo é vazio", () => {
    expect(matchesSong(song(), "")).toBe(true);
  });

  it("casa com tudo quando o termo é só espaço", () => {
    expect(matchesSong(song(), "   ")).toBe(true);
  });
});

describe("songKey", () => {
  it("devolve o tom principal quando existe", () => {
    expect(songKey(song({ key: "D", key_alt: "E" }))).toBe("D");
  });

  it("cai no tom alternativo quando o principal é nulo", () => {
    expect(songKey(song({ key: null, key_alt: "E" }))).toBe("E");
  });

  it("devolve null quando nenhum dos dois existe", () => {
    expect(songKey(song({ key: null, key_alt: null }))).toBeNull();
  });
});
