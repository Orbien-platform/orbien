"use client";

import { useEffect } from "react";
import { useEditor, useEditorState, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Strikethrough,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link2,
  Undo2,
  Redo2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Editor do corpo do post. O que ele grava continua sendo **Markdown** — o
 * formato que o campo sempre declarou e que o app mobile renderiza
 * (`apps/mobile/src/components/MarkdownText.tsx`). O editor é só uma forma
 * menos hostil de escrever: quem não conhece `**` e `##` usa os botões.
 *
 * O conjunto de formatação é o que o renderizador do mobile entende: negrito,
 * itálico, riscado, dois níveis de título, listas, citação e link. Código,
 * sublinhado e linha horizontal ficam de fora — ou não existem em Markdown
 * (sublinhado), ou chegariam no app como símbolo cru.
 */
interface RichTextEditorProps {
  id?: string;
  /**
   * Nome acessível do campo. Precisa ir como `aria-label`: `<label for>` só
   * associa a elemento rotulável (input, textarea…), e o editor é um `div`
   * contenteditable. É por este nome que leitor de tela e e2e o encontram.
   */
  label: string;
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function RichTextEditor({ id, label, value, onChange, placeholder, disabled }: RichTextEditorProps) {
  const editor = useEditor({
    // Next renderiza no servidor primeiro; sem isto o Tiptap acusa
    // hydration mismatch.
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        horizontalRule: false,
        underline: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      Markdown,
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: value,
    contentType: "markdown",
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
        class:
          "rich-text min-h-[140px] max-h-[360px] overflow-y-auto px-3 py-2 text-sm text-ink dark:text-white focus:outline-none",
      },
    },
    onUpdate: ({ editor: e }) => onChange(markdownOf(e)),
  });

  // O valor pode mudar por fora (o modal zera o formulário ao fechar; a folha
  // de detalhe carrega o post ao entrar em edição). Só reescreve quando
  // diverge, senão cada tecla voltaria o cursor para o início.
  useEffect(() => {
    if (!editor) return;
    if (value.trimEnd() !== markdownOf(editor)) {
      editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
    }
  }, [editor, value]);

  // `false`: sem ele `setEditable` emite um update, e o `onChange` disparava
  // ao montar, sem ninguém ter digitado nada.
  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);

  return (
    <div
      className={cn(
        "rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] focus-within:ring-2 focus-within:ring-navy/20",
        disabled && "opacity-60",
      )}
    >
      {editor ? <Toolbar editor={editor} disabled={disabled} /> : null}
      <EditorContent editor={editor} />
    </div>
  );
}

/**
 * O Markdown do editor sem as quebras de linha que o Tiptap deixa no fim
 * (`"## texto\n\n"`). As duas pontas — o que sai em `onChange` e o que se
 * compara com o `value` de fora — têm que usar a mesma forma, senão a
 * comparação vê diferença onde não há e reescreve o conteúdo à toa.
 */
function markdownOf(editor: Editor): string {
  return editor.getMarkdown().trimEnd();
}

function Toolbar({ editor, disabled }: { editor: Editor; disabled?: boolean }) {
  // `useEditorState` re-renderiza a barra só quando a seleção muda de
  // formatação — é o que acende o botão de negrito ao entrar num trecho em
  // negrito.
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  function toggleLink() {
    if (state.link) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    const url = window.prompt("Endereço do link (https://…)");
    if (!url) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  const groups: ToolbarButtonProps[][] = [
    [
      { label: "Negrito", icon: Bold, active: state.bold, onClick: () => editor.chain().focus().toggleBold().run() },
      { label: "Itálico", icon: Italic, active: state.italic, onClick: () => editor.chain().focus().toggleItalic().run() },
      { label: "Riscado", icon: Strikethrough, active: state.strike, onClick: () => editor.chain().focus().toggleStrike().run() },
    ],
    [
      { label: "Título", icon: Heading2, active: state.h2, onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
      { label: "Subtítulo", icon: Heading3, active: state.h3, onClick: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
    ],
    [
      { label: "Lista com marcadores", icon: List, active: state.bullet, onClick: () => editor.chain().focus().toggleBulletList().run() },
      { label: "Lista numerada", icon: ListOrdered, active: state.ordered, onClick: () => editor.chain().focus().toggleOrderedList().run() },
      { label: "Citação", icon: Quote, active: state.quote, onClick: () => editor.chain().focus().toggleBlockquote().run() },
      { label: state.link ? "Remover link" : "Link", icon: Link2, active: state.link, onClick: toggleLink },
    ],
    [
      { label: "Desfazer", icon: Undo2, disabled: !state.canUndo, onClick: () => editor.chain().focus().undo().run() },
      { label: "Refazer", icon: Redo2, disabled: !state.canRedo, onClick: () => editor.chain().focus().redo().run() },
    ],
  ];

  return (
    <div
      role="toolbar"
      aria-label="Formatação do texto"
      className="flex flex-wrap items-center gap-1 border-b border-[var(--border-default)] px-1.5 py-1"
    >
      {groups.map((group, i) => (
        <div key={i} className="flex items-center gap-0.5">
          {i > 0 && <span aria-hidden className="mx-1 h-5 w-px bg-[var(--border-default)]" />}
          {group.map((b) => (
            <ToolbarButton key={b.label} {...b} disabled={disabled || b.disabled} />
          ))}
        </div>
      ))}
    </div>
  );
}

interface ToolbarButtonProps {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}

function ToolbarButton({ label, icon: Icon, onClick, active, disabled }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Sem isto o clique tira o foco do editor antes do comando rodar e a
      // seleção se perde.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-stone transition-colors hover:bg-[var(--surface-subtle)] hover:text-ink dark:hover:text-white disabled:pointer-events-none disabled:opacity-40",
        active && "bg-navy/10 text-navy dark:bg-white/10 dark:text-white",
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
