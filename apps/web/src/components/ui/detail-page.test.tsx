import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import {
  DetailPage,
  DetailPageContent,
  DetailPageDescription,
  DetailPageHeader,
  DetailPageTitle,
} from "./detail-page";

function setup(open: boolean, onOpenChange = vi.fn()) {
  render(
    <DetailPage open={open} onOpenChange={onOpenChange} backLabel="Voltar para grupos">
      <DetailPageContent>
        <DetailPageHeader>
          <DetailPageTitle>Célula Alfa</DetailPageTitle>
        </DetailPageHeader>
      </DetailPageContent>
    </DetailPage>
  );
  return onOpenChange;
}

describe("DetailPage", () => {
  it("não renderiza nada fechada", () => {
    setup(false);
    expect(screen.queryByText("Célula Alfa")).not.toBeInTheDocument();
  });

  it("renderiza inline, nomeada pelo título", () => {
    setup(true);
    expect(screen.getByRole("region", { name: "Célula Alfa" })).toBeInTheDocument();
  });

  it("o botão de voltar fecha", async () => {
    const onOpenChange = setup(true);
    await userEvent.click(screen.getByRole("button", { name: "Voltar para grupos" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Esc fecha", async () => {
    const onOpenChange = setup(true);
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Esc não fecha com um diálogo aberto por cima", async () => {
    const onOpenChange = setup(true);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);
    await userEvent.keyboard("{Escape}");
    dialog.remove();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("Esc já tratado por outro handler não fecha", () => {
    const onOpenChange = setup(true);
    const e = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    e.preventDefault();
    document.dispatchEvent(e);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("usa o rótulo padrão do botão de voltar e a descrição liga ao contexto", () => {
    render(
      <DetailPage open onOpenChange={vi.fn()} className="extra">
        <DetailPageContent className="miolo">
          <DetailPageHeader className="cab">
            <DetailPageTitle className="tit">Título</DetailPageTitle>
            <DetailPageDescription className="desc">Descrição</DetailPageDescription>
          </DetailPageHeader>
        </DetailPageContent>
      </DetailPage>
    );
    expect(screen.getByRole("button", { name: "Voltar" })).toBeInTheDocument();
    expect(screen.getByText("Descrição")).toHaveAttribute("id");
  });

  it("título e descrição funcionam fora do contexto", () => {
    render(
      <>
        <DetailPageTitle>Solto</DetailPageTitle>
        <DetailPageDescription>Solta</DetailPageDescription>
      </>
    );
    expect(screen.getByText("Solto")).not.toHaveAttribute("id");
    expect(screen.getByText("Solta")).not.toHaveAttribute("id");
  });

  it("volta ao topo do <main> ao abrir", () => {
    const scrollTo = vi.fn();
    render(
      <main ref={(el) => { if (el) el.scrollTo = scrollTo; }}>
        <DetailPage open onOpenChange={vi.fn()}>
          <DetailPageTitle>Topo</DetailPageTitle>
        </DetailPage>
      </main>
    );
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  });
});
