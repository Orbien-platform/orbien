import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { PageTransition } from "./PageTransition";

vi.mock("next/navigation", () => ({ usePathname: vi.fn() }));

describe("PageTransition", () => {
  it("envolve a tela na classe de entrada", () => {
    vi.mocked(usePathname).mockReturnValue("/pessoas");
    render(<PageTransition><span>Tela</span></PageTransition>);
    expect(screen.getByText("Tela").parentElement).toHaveClass("page-enter");
  });

  it("remonta o invólucro quando o caminho muda, para a animação rodar de novo", () => {
    vi.mocked(usePathname).mockReturnValue("/pessoas");
    const { rerender } = render(<PageTransition><span>Tela</span></PageTransition>);
    const first = screen.getByText("Tela").parentElement;

    vi.mocked(usePathname).mockReturnValue("/grupos");
    rerender(<PageTransition><span>Tela</span></PageTransition>);
    expect(screen.getByText("Tela").parentElement).not.toBe(first);
  });
});
