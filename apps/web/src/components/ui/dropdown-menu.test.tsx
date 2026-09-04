import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu";

describe("DropdownMenu", () => {
  it("abre o menu ao clicar no trigger e mostra os itens", async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Abrir menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Conta</DropdownMenuLabel>
            <DropdownMenuItem>Perfil</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Sair</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    expect(screen.queryByText("Perfil")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Abrir menu"));
    expect(await screen.findByText("Conta")).toBeInTheDocument();
    expect(screen.getByText("Perfil")).toBeInTheDocument();
    expect(screen.getByText("Sair")).toBeInTheDocument();
  });

  it("chama onClick do item selecionado", async () => {
    const onSelect = vi.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Abrir</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={onSelect}>Excluir</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    await userEvent.click(screen.getByText("Abrir"));
    await userEvent.click(await screen.findByText("Excluir"));
    expect(onSelect).toHaveBeenCalled();
  });

  it("renderiza item de checkbox marcado", async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Abrir</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem checked>Mostrar arquivados</DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    await userEvent.click(screen.getByText("Abrir"));
    expect(await screen.findByRole("menuitemcheckbox")).toHaveAttribute("aria-checked", "true");
  });

  it("renderiza grupo de radio e shortcut", async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Abrir</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup value="a">
            <DropdownMenuRadioItem value="a">Opção A</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="b">Opção B</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuItem>
            Copiar
            <DropdownMenuShortcut>⌘C</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    await userEvent.click(screen.getByText("Abrir"));
    expect(await screen.findByText("Opção A")).toBeInTheDocument();
    expect(screen.getByText("⌘C")).toBeInTheDocument();
  });

  it("DropdownMenuPortal com keepMounted renderiza os filhos via portal", () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Abrir</DropdownMenuTrigger>
        <DropdownMenuPortal keepMounted>
          <div data-testid="portal-content">Conteúdo do portal</div>
        </DropdownMenuPortal>
      </DropdownMenu>
    );
    expect(screen.getByTestId("portal-content")).toBeInTheDocument();
  });

  it("abre um submenu ao passar pelo trigger de sub", async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Abrir</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Mais opções</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Arquivar</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    await user.click(screen.getByText("Abrir"));
    await user.hover(await screen.findByText("Mais opções"));
    expect(await screen.findByText("Arquivar")).toBeInTheDocument();
  });
});
