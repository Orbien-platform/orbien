import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import {
  DetailPage,
  DetailPageContent,
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

  it("Esc fecha, exceto com um diálogo aberto por cima", async () => {
    const onOpenChange = setup(true);
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
