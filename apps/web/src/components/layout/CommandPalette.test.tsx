import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/hooks/useAuth";
import { useChurchIdentity } from "@/contexts/ChurchIdentityContext";
import { CommandPalette } from "./CommandPalette";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/contexts/ChurchIdentityContext", () => ({ useChurchIdentity: vi.fn() }));

function setup(areas: string[] | null = null) {
  push.mockClear();
  vi.mocked(useAuth).mockReturnValue({
    user: {
      id: "1",
      name: "Ana",
      email: "ana@example.com",
      roles: ["tenant_admin"],
      tenant_id: "t1",
      congregation_id: "c1",
      support_session: false,
      support_tenant_name: null,
      areas,
      expires_at: Math.floor(Date.now() / 1000) + 300,
    },
    isLoading: false,
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
  });
  vi.mocked(useChurchIdentity).mockReturnValue({
    churchName: "Igreja",
    congregationName: null,
    groupTerm: { singular: "Célula", plural: "Células" },
  } as ReturnType<typeof useChurchIdentity>);
}

async function openByButton() {
  await userEvent.click(screen.getByRole("button", { name: "Buscar tela" }));
  return screen.findByRole("combobox", { name: "Nome da tela" });
}

describe("CommandPalette", () => {
  beforeEach(() => setup());

  it("abre pelo botão e lista as telas com o termo da igreja", async () => {
    render(<CommandPalette />);
    await openByButton();
    expect(screen.getByRole("option", { name: /Células/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Início/ })).toBeInTheDocument();
  });

  it("abre com ⌘K e com Ctrl+K, e fecha com o mesmo atalho", async () => {
    render(<CommandPalette />);
    await userEvent.keyboard("{Meta>}k{/Meta}");
    expect(await screen.findByRole("combobox")).toBeInTheDocument();
    await userEvent.keyboard("{Meta>}k{/Meta}");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(await screen.findByRole("combobox")).toBeInTheDocument();
  });

  it("filtra sem acento e abre a tela com Enter", async () => {
    render(<CommandPalette />);
    const input = await openByButton();
    await userEvent.type(input, "celebracoes");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await userEvent.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/celebracoes");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("navega pelas setas e dá a volta nas pontas", async () => {
    render(<CommandPalette />);
    const input = await openByButton();
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getAllByRole("option").at(-1)).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(push).toHaveBeenCalledTimes(1);
    expect(input).toBeDefined();
  });

  it("abre a tela clicada", async () => {
    render(<CommandPalette />);
    await openByButton();
    await userEvent.click(screen.getByRole("option", { name: /Redes/ }));
    expect(push).toHaveBeenCalledWith("/redes");
  });

  it("avisa quando nada casa e Enter não navega", async () => {
    render(<CommandPalette />);
    const input = await openByButton();
    await userEvent.type(input, "zzzz");
    expect(screen.getByText("Nenhuma tela com esse nome.")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowDown}{ArrowUp}{Enter}");
    expect(push).not.toHaveBeenCalled();
  });

  it("não oferece a tela que o papel não alcança", async () => {
    setup(["persons"]);
    render(<CommandPalette />);
    await openByButton();
    expect(screen.queryByRole("option", { name: /Financeiro|Visão geral/ })).not.toBeInTheDocument();
  });

  it("mostra a coroa na área Premium que o plano barra", async () => {
    setup(["persons"]);
    vi.mocked(useAuth).mockReturnValue({
      ...vi.mocked(useAuth)(),
      user: { ...vi.mocked(useAuth)().user!, upgrade_areas: ["financial"] },
    });
    render(<CommandPalette />);
    await openByButton();
    expect(screen.getByLabelText("Premium")).toBeInTheDocument();
  });

  it("fecha com Esc e limpa a busca", async () => {
    render(<CommandPalette />);
    const input = await openByButton();
    await userEvent.type(input, "red");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    const again = await openByButton();
    expect(again).toHaveValue("");
  });
});
