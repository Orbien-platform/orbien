import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FaqItem } from "@/components/ui/FaqItem";

describe("FaqItem", () => {
  it("renderiza pergunta e resposta dentro de um <details> fechado", () => {
    const { container } = render(<FaqItem q="Preciso de CNPJ?" a="Não." />);
    const details = container.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(screen.getByText("Preciso de CNPJ?")).toBeInTheDocument();
    expect(screen.getByText("Não.")).toBeInTheDocument();
  });

  it("aplica os espaçamentos padrão", () => {
    const { container } = render(<FaqItem q="P" a="R" />);
    expect(container.querySelector("summary")!.className).toContain("py-[22px]");
    const body = container.querySelector("details > div")!;
    expect(body.className).toContain("pb-6");
    expect(body.className).toContain("max-w-[680px]");
    expect(body.className).toContain("leading-relaxed");
  });

  it("aceita sobrescrita de espaçamento e largura", () => {
    const { container } = render(
      <FaqItem q="P" a="R" summaryPy="py-4" bodyPb="pb-3" bodyMaxWidth="max-w-none" bodyLeading="leading-snug" />
    );
    expect(container.querySelector("summary")!.className).toContain("py-4");
    const body = container.querySelector("details > div")!;
    expect(body.className).toContain("pb-3");
    expect(body.className).toContain("max-w-none");
    expect(body.className).toContain("leading-snug");
  });

  it("aceita ReactNode em pergunta e resposta", () => {
    render(<FaqItem q={<span>Com <b>markup</b></span>} a={<em>Resposta rica</em>} />);
    expect(screen.getByText("markup")).toBeInTheDocument();
    expect(screen.getByText("Resposta rica")).toBeInTheDocument();
  });
});
