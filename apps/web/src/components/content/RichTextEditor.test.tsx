import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { RichTextEditor } from "./RichTextEditor";

// Tiptap de verdade, sem mock: o que importa aqui é que botão vira Markdown.
// O jsdom não tem layout, então nada de digitar texto no contenteditable —
// os comandos de bloco (título, lista, citação) agem no parágrafo do cursor
// e não precisam de seleção.

// O jsdom não mede nada: o ProseMirror chama `getClientRects` para rolar a
// seleção até a vista, e sem isto cada comando com `focus()` estoura.
beforeAll(() => {
  const rects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getClientRects = rects;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Element.prototype.getClientRects ??= rects;
  document.elementFromPoint ??= () => null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderEditor(props: Partial<Parameters<typeof RichTextEditor>[0]> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <RichTextEditor label="Corpo" value="texto" onChange={onChange} placeholder="Escreva…" {...props} />,
  );
  await screen.findByRole("toolbar", { name: "Formatação do texto" });
  return { onChange, ...utils };
}

describe("RichTextEditor", () => {
  it("mostra o Markdown recebido já formatado, com nome acessível", async () => {
    await renderEditor({ id: "cp-body", value: "## Culto\n\nOi **forte**" });

    const box = screen.getByRole("textbox", { name: "Corpo" });
    expect(box).toHaveAttribute("id", "cp-body");
    expect(box.querySelector("h2")).toHaveTextContent("Culto");
    expect(box.querySelector("strong")).toHaveTextContent("forte");
  });

  it.each([
    ["Título", "## texto"],
    ["Subtítulo", "### texto"],
    ["Lista com marcadores", "- texto"],
    ["Lista numerada", "1. texto"],
    ["Citação", "> texto"],
  ])("botão %s grava %s", async (label, markdown) => {
    const user = userEvent.setup();
    const { onChange } = await renderEditor();

    await user.click(screen.getByRole("button", { name: label }));

    expect(onChange).toHaveBeenLastCalledWith(markdown);
    expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true");
  });

  it.each(["Negrito", "Itálico", "Riscado"])(
    "botão %s liga a marca para o que for digitado a seguir",
    async (label) => {
      const user = userEvent.setup();
      await renderEditor();

      await user.click(screen.getByRole("button", { name: label }));

      expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true");
    },
  );

  it("desfazer e refazer voltam e reaplicam a última mudança", async () => {
    const user = userEvent.setup();
    const { onChange } = await renderEditor();
    expect(screen.getByRole("button", { name: "Desfazer" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Título" }));
    await user.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(onChange).toHaveBeenLastCalledWith("texto");

    await user.click(screen.getByRole("button", { name: "Refazer" }));
    expect(onChange).toHaveBeenLastCalledWith("## texto");
  });

  it("link: pede o endereço; cancelar não faz nada", async () => {
    const user = userEvent.setup();
    const prompt = vi.spyOn(window, "prompt").mockReturnValue(null);
    const { onChange } = await renderEditor();

    await user.click(screen.getByRole("button", { name: "Link" }));

    expect(prompt).toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("link: com endereço, aplica o comando sem erro", async () => {
    const user = userEvent.setup();
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("https://x.org");
    await renderEditor();

    // Sem nada selecionado o link não tem onde grudar; o que se prova aqui é
    // que, com um endereço em mãos, o comando roda.
    await user.click(screen.getByRole("button", { name: "Link" }));

    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("dentro de um link o botão vira 'Remover link' e tira a marca", async () => {
    const user = userEvent.setup();
    const { onChange } = await renderEditor({ value: "[site](https://x.org)" });

    await user.click(await screen.findByRole("button", { name: "Remover link" }));

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("site"));
  });

  it("montar não dispara onChange", async () => {
    const { onChange } = await renderEditor();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("valor novo vindo de fora substitui o conteúdo; o mesmo valor não mexe", async () => {
    const { onChange, rerender } = await renderEditor({ value: "um" });

    rerender(<RichTextEditor label="Corpo" value="dois" onChange={onChange} />);
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Corpo" })).toHaveTextContent("dois"),
    );
    rerender(<RichTextEditor label="Corpo" value="dois" onChange={onChange} />);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("desabilitado: editor só leitura e botões travados", async () => {
    const { rerender, onChange } = await renderEditor({ disabled: true });

    const box = screen.getByRole("textbox", { name: "Corpo" });
    expect(box).toHaveAttribute("contenteditable", "false");
    expect(screen.getByRole("button", { name: "Negrito" })).toBeDisabled();

    await act(async () => {
      rerender(<RichTextEditor label="Corpo" value="texto" onChange={onChange} />);
    });
    expect(box).toHaveAttribute("contenteditable", "true");
  });
});
