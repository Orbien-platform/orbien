"use client";

import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { cn } from "@/lib/utils";

/**
 * Leitura do corpo do post. É o mesmo Tiptap do `RichTextEditor`, travado em
 * somente-leitura: quem interpreta o Markdown na leitura é quem o escreveu na
 * edição, então as duas telas não divergem. E o Tiptap monta DOM a partir do
 * esquema dele, nunca de HTML cru do texto — um `<script>` digitado no corpo
 * vira texto, não elemento.
 */
export function MarkdownView({ markdown, className }: { markdown: string; className?: string }) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: [
      StarterKit.configure({ link: { openOnClick: true } }),
      Markdown,
    ],
    content: markdown,
    contentType: "markdown",
    editorProps: { attributes: { class: cn("rich-text focus:outline-none", className) } },
  });

  useEffect(() => {
    if (editor && markdown.trimEnd() !== editor.getMarkdown().trimEnd()) {
      editor.commands.setContent(markdown, { contentType: "markdown", emitUpdate: false });
    }
  }, [editor, markdown]);

  return <EditorContent editor={editor} />;
}
