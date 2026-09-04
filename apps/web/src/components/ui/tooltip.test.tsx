import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

describe("Tooltip", () => {
  it("mostra o conteúdo ao passar o mouse sobre o trigger", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Ajuda</TooltipTrigger>
          <TooltipContent>Texto de ajuda</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
    expect(screen.queryByText("Texto de ajuda")).not.toBeInTheDocument();

    await user.hover(screen.getByText("Ajuda"));
    expect(await screen.findByText("Texto de ajuda")).toBeInTheDocument();
  });

  it("esconde o conteúdo ao tirar o mouse", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Ajuda</TooltipTrigger>
          <TooltipContent>Texto de ajuda</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
    await user.hover(screen.getByText("Ajuda"));
    await screen.findByText("Texto de ajuda");

    await user.unhover(screen.getByText("Ajuda"));
    expect(screen.queryByText("Texto de ajuda")).not.toBeInTheDocument();
  });
});
