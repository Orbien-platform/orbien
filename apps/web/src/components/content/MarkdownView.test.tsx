import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MarkdownView } from "./MarkdownView";

describe("MarkdownView", () => {
  it("mostra o Markdown formatado", async () => {
    const { container } = render(<MarkdownView markdown={"## Culto\n\n- **Louvor** às 19h"} />);

    await waitFor(() => expect(container.querySelector("h2")).toHaveTextContent("Culto"));
    expect(container.querySelector("li strong")).toHaveTextContent("Louvor");
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it("HTML digitado no corpo vira texto, não elemento", async () => {
    const { container } = render(<MarkdownView markdown={"<script>alert(1)</script> oi"} />);

    await waitFor(() => expect(container).toHaveTextContent("oi"));
    expect(container.querySelector("script")).toBeNull();
  });

  it("troca de post atualiza o conteúdo", async () => {
    const { container, rerender } = render(<MarkdownView markdown="primeiro" />);
    await waitFor(() => expect(container).toHaveTextContent("primeiro"));

    rerender(<MarkdownView markdown="segundo" />);

    await waitFor(() => expect(container).toHaveTextContent("segundo"));
    expect(container).not.toHaveTextContent("primeiro");
  });
});
