import { parseInline, parseMarkdown } from "./markdown";

describe("parseInline", () => {
  it("negrito, itálico e riscado, inclusive aninhados", () => {
    expect(parseInline("a **b _c_** ~~d~~")).toEqual([
      { text: "a " },
      { text: "b ", bold: true },
      { text: "c", bold: true, italic: true },
      { text: " " },
      { text: "d", strike: true },
    ]);
  });

  it("link http vira href; javascript: fica só texto", () => {
    expect(parseInline("[site](https://x.org)")).toEqual([{ text: "site", href: "https://x.org" }]);
    expect(parseInline("[mal](javascript:alert(1))")[0]).not.toHaveProperty("href");
  });

  it("escape e símbolo solto passam como texto", () => {
    expect(parseInline("2 \\* 3 = 6 e 5 * 2")).toEqual([{ text: "2 * 3 = 6 e 5 * 2" }]);
  });
});

describe("parseMarkdown", () => {
  it("separa títulos, listas, citação e parágrafos", () => {
    const blocks = parseMarkdown(
      "## Título\n\nTexto um\nlinha dois\n\n- item a\n  - sub\n1. primeiro\n\n> citação\n> continua",
    );
    expect(blocks.map((b) => b.kind)).toEqual([
      "heading",
      "paragraph",
      "listItem",
      "listItem",
      "listItem",
      "quote",
    ]);
    expect(blocks[1]).toEqual({ kind: "paragraph", spans: [{ text: "Texto um\nlinha dois" }] });
    expect(blocks[3]).toMatchObject({ ordered: false, depth: 1, marker: "•" });
    expect(blocks[4]).toMatchObject({ ordered: true, marker: "1." });
  });

  it("corpo antigo, texto puro, continua igual", () => {
    expect(parseMarkdown("Culto domingo às 19h.")).toEqual([
      { kind: "paragraph", spans: [{ text: "Culto domingo às 19h." }] },
    ]);
  });

  it("colchete sem link completo fica como texto", () => {
    expect(parseInline("[sem fechamento")).toEqual([{ text: "[sem fechamento" }]);
  });
});
