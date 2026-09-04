import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CheckIcon } from "./CheckIcon";
import { FaqItem } from "./FaqItem";
import { Reveal } from "./Reveal";
import { SectionLabel } from "./SectionLabel";

describe("CheckIcon", () => {
  it("usa o tamanho médio por padrão", () => {
    const { container } = render(<CheckIcon />);
    const marca = container.firstElementChild!;

    expect(marca.className).toContain("w-[18px]");
    expect(marca.querySelector("svg")).toHaveAttribute("width", "10");
  });

  it("encolhe no tamanho pequeno", () => {
    const { container } = render(<CheckIcon size="sm" />);
    const marca = container.firstElementChild!;

    expect(marca.className).toContain("w-3.5");
    expect(marca.querySelector("svg")).toHaveAttribute("width", "8");
  });

  it("acrescenta a classe recebida sem perder as próprias", () => {
    const { container } = render(<CheckIcon className="mt-1" />);
    const marca = container.firstElementChild!;

    expect(marca.className).toContain("mt-1");
    expect(marca.className).toContain("rounded-full");
  });
});

describe("FaqItem", () => {
  it("mostra pergunta e resposta dentro de um <details>", () => {
    const { container } = render(<FaqItem q="Quanto custa?" a="Depende do plano." />);

    expect(container.querySelector("details")).toBeInTheDocument();
    expect(screen.getByText("Quanto custa?")).toBeInTheDocument();
    expect(screen.getByText("Depende do plano.")).toBeInTheDocument();
  });

  it("aplica o espaçamento padrão e o customizado", () => {
    const { container, rerender } = render(<FaqItem q="P" a="R" />);
    expect(container.querySelector("summary")!.className).toContain("py-[22px]");
    expect(screen.getByText("R").className).toContain("pb-6");
    expect(screen.getByText("R").className).toContain("max-w-[680px]");
    expect(screen.getByText("R").className).toContain("leading-relaxed");

    rerender(
      <FaqItem
        q="P"
        a="R"
        summaryPy="py-4"
        bodyPb="pb-2"
        bodyMaxWidth="max-w-full"
        bodyLeading="leading-tight"
      />
    );
    expect(container.querySelector("summary")!.className).toContain("py-4");
    expect(screen.getByText("R").className).toContain("pb-2");
    expect(screen.getByText("R").className).toContain("max-w-full");
    expect(screen.getByText("R").className).toContain("leading-tight");
  });
});

describe("Reveal", () => {
  const observe = vi.fn();
  const unobserve = vi.fn();
  const disconnect = vi.fn();
  let acionar: (entradas: { isIntersecting: boolean; target: Element }[]) => void;

  beforeEach(() => {
    observe.mockClear();
    unobserve.mockClear();
    disconnect.mockClear();
    // jsdom não implementa IntersectionObserver.
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: (e: { isIntersecting: boolean; target: Element }[]) => void) {
          acionar = cb;
        }
        observe = observe;
        unobserve = unobserve;
        disconnect = disconnect;
      }
    );
  });

  it("observa o próprio elemento e marca `in` ao entrar na tela", () => {
    const { container } = render(<Reveal>conteúdo</Reveal>);
    const alvo = container.firstElementChild!;

    expect(alvo.className).toBe("reveal ");
    expect(observe).toHaveBeenCalledWith(alvo);

    acionar([{ isIntersecting: true, target: alvo }]);

    expect(alvo.className).toContain("in");
    // Uma vez revelado, para de observar.
    expect(unobserve).toHaveBeenCalledWith(alvo);
  });

  it("fora da tela não marca nada", () => {
    const { container } = render(<Reveal>conteúdo</Reveal>);
    const alvo = container.firstElementChild!;

    acionar([{ isIntersecting: false, target: alvo }]);

    expect(alvo.className).not.toContain("in");
    expect(unobserve).not.toHaveBeenCalled();
  });

  it("acrescenta a classe recebida e desconecta ao desmontar", () => {
    const { container, unmount } = render(
      <Reveal className="delay-1">conteúdo</Reveal>
    );
    expect(container.firstElementChild!.className).toBe("reveal delay-1");

    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});

describe("SectionLabel", () => {
  it("mostra o texto com a cor padrão do traço", () => {
    render(<SectionLabel>Como funciona</SectionLabel>);
    const rotulo = screen.getByText(/Como funciona/);

    expect(rotulo).toHaveStyle({ color: "var(--navy-accent)" });
    expect(rotulo.querySelector("span")).toHaveStyle({
      background: "var(--navy-accent)",
    });
  });

  it("aceita cor e cor de traço próprias", () => {
    render(
      <SectionLabel color="#fff" lineColor="#000" className="mb-4">
        Preços
      </SectionLabel>
    );
    const rotulo = screen.getByText(/Preços/);

    expect(rotulo.className).toContain("mb-4");
    expect(rotulo).toHaveStyle({ color: "#fff" });
    expect(rotulo.querySelector("span")).toHaveStyle({ background: "#000" });
  });
});
