import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { KidsNav } from "./KidsNav";
import { KidsPage } from "./KidsPage";

vi.mock("next/navigation", () => ({ usePathname: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

function signedInAs(user: Record<string, unknown> | null) {
  vi.mocked(useAuth).mockReturnValue({
    user,
    isLoading: false,
    isAuthenticated: !!user,
    login: vi.fn(),
    logout: vi.fn(),
  } as never);
}

describe("KidsNav", () => {
  it("marca só a tela atual: o Balcão não acende em Turmas", () => {
    vi.mocked(usePathname).mockReturnValue("/kids/turmas");
    render(<KidsNav />);
    expect(screen.getByRole("link", { name: "Turmas" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Balcão" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Crianças" })).toHaveAttribute("href", "/kids/criancas");
  });
});

describe("KidsPage", () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue("/kids");
  });

  it("numa igreja Starter mostra o convite Premium em vez da tela", () => {
    signedInAs({ roles: ["tenant_admin"], areas: [], upgrade_areas: ["celebrations"] });
    const body = vi.fn(() => <p>conteúdo</p>);
    render(<KidsPage title="Kids">{body}</KidsPage>);
    expect(screen.getByText("Disponível no plano Premium")).toBeInTheDocument();
    expect(body).not.toHaveBeenCalled();
  });

  it("entrega canManage conforme o papel", () => {
    signedInAs({ roles: ["secretary"], areas: ["celebrations"], upgrade_areas: [] });
    render(
      <KidsPage title="Kids" subtitle="Subtítulo">
        {({ canManage }) => <p>manage:{String(canManage)}</p>}
      </KidsPage>,
    );
    expect(screen.getByRole("heading", { name: "Kids" })).toBeInTheDocument();
    expect(screen.getByText("Subtítulo")).toBeInTheDocument();
    expect(screen.getByText("manage:true")).toBeInTheDocument();
  });

  it("papel fora da gestão, ou sem sessão, não gerencia", () => {
    signedInAs({ roles: ["volunteer"], areas: null });
    const { unmount } = render(<KidsPage title="Kids">{({ canManage }) => <p>manage:{String(canManage)}</p>}</KidsPage>);
    expect(screen.getByText("manage:false")).toBeInTheDocument();
    unmount();
    signedInAs(null);
    render(<KidsPage title="Kids">{({ canManage }) => <p>manage:{String(canManage)}</p>}</KidsPage>);
    expect(screen.getByText("manage:false")).toBeInTheDocument();
  });
});
