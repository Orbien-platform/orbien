// Parser do Markdown do corpo do post — só o subconjunto que o editor do web
// (`apps/web/src/components/content/RichTextEditor.tsx`) produz: parágrafo,
// título (## e ###), lista com marcador e numerada, citação, e no meio do
// texto negrito, itálico, riscado e link. Qualquer outra coisa passa como
// texto, que é o comportamento de antes (o corpo era um <Text> cru).
//
// Escrito à mão em vez de lib: as libs de Markdown para React Native
// arrastam um parser completo e um renderizador próprio, e o que o app
// precisa cabe aqui. Separado da tela para ser testável sem render.

export interface InlineSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  href?: string;
}

export type MarkdownBlock =
  | { kind: "paragraph"; spans: InlineSpan[] }
  | { kind: "heading"; level: 2 | 3; spans: InlineSpan[] }
  | { kind: "quote"; spans: InlineSpan[] }
  | { kind: "listItem"; ordered: boolean; marker: string; depth: number; spans: InlineSpan[] };

type Style = Omit<InlineSpan, "text">;

/** Só abre link com esquema conhecido — `javascript:` e afins viram texto. */
function safeHref(url: string): string | undefined {
  return /^(https?:\/\/|mailto:)/i.test(url.trim()) ? url.trim() : undefined;
}

export function parseInline(source: string, style: Style = {}): InlineSpan[] {
  const out: InlineSpan[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer) out.push({ ...style, text: buffer });
    buffer = "";
  };

  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);

    // Escape: `\*` é um asterisco de verdade.
    if (rest[0] === "\\" && rest.length > 1 && /[\\`*_{}[\]()#+\-.!~>]/.test(rest[1]!)) {
      buffer += rest[1];
      i += 2;
      continue;
    }

    const delimited = (
      [
        ["**", { bold: true }],
        ["__", { bold: true }],
        ["~~", { strike: true }],
        ["*", { italic: true }],
        ["_", { italic: true }],
      ] as const
    ).find(([mark]) => rest.startsWith(mark));
    if (delimited) {
      const [mark, add] = delimited;
      const close = rest.indexOf(mark, mark.length);
      // Precisa de conteúdo entre os dois, senão é só um símbolo solto.
      if (close > mark.length) {
        flush();
        out.push(...parseInline(rest.slice(mark.length, close), { ...style, ...add }));
        i += close + mark.length;
        continue;
      }
    }

    if (rest[0] === "[") {
      const link = /^\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(rest);
      if (link) {
        flush();
        const href = safeHref(link[2]!);
        out.push(...parseInline(link[1]!, href ? { ...style, href } : style));
        i += link[0].length;
        continue;
      }
    }

    buffer += rest[0];
    i += 1;
  }

  flush();
  return out;
}

export function parseMarkdown(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      // Quebra simples dentro do parágrafo continua quebra: o corpo antigo,
      // escrito num textarea, usava Enter para mudar de linha.
      blocks.push({ kind: "paragraph", spans: parseInline(paragraph.join("\n")) });
    }
    paragraph = [];
  };

  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.replace(/\s+$/, "");

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({
        kind: "heading",
        level: heading[1]!.length <= 2 ? 2 : 3,
        spans: parseInline(heading[2]!),
      });
      continue;
    }

    const item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      flushParagraph();
      const ordered = /\d/.test(item[2]!);
      blocks.push({
        kind: "listItem",
        ordered,
        marker: ordered ? item[2]!.replace(")", ".") : "•",
        depth: Math.floor(item[1]!.replace(/\t/g, "  ").length / 2),
        spans: parseInline(item[3]!),
      });
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      const previous = blocks[blocks.length - 1];
      // Linhas seguidas de citação são a mesma citação.
      if (previous?.kind === "quote") {
        previous.spans.push({ text: "\n" }, ...parseInline(quote[1]!));
      } else {
        blocks.push({ kind: "quote", spans: parseInline(quote[1]!) });
      }
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  return blocks;
}
