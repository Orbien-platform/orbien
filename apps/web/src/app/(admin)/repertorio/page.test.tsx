import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAuth } from "@/hooks/useAuth";
import RepertorioPage from "./page";

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/components/repertorio/SongCatalogPanel", () => ({
  SongCatalogPanel: ({ canEdit }: { canEdit: boolean }) => (
    <div data-testid="song-catalog-panel">repertorio:{String(canEdit)}</div>
  ),
}));

const mockedUseAuth = vi.mocked(useAuth);

function setup(roles: string[] = ["tenant_admin"]) {
  mockedUseAuth.mockReturnValue({
    user: {
      id: "u1",
      name: "Ana",
      email: "ana@a.com",
      roles,
      tenant_id: "t1",
      congregation_id: "c1",
      support_session: false,
      support_tenant_name: null,
      expires_at: Math.floor(Date.now() / 1000) + 300,
    },
    isLoading: false,
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

describe("RepertorioPage", () => {
  it("dá permissão de edição para quem pode gerir o repertório", () => {
    setup(["pastor"]);
    render(<RepertorioPage />);
    expect(screen.getByTestId("song-catalog-panel")).toHaveTextContent("repertorio:true");
  });

  it("nega permissão de edição para quem não pode gerir o repertório", () => {
    setup(["volunteer"]);
    render(<RepertorioPage />);
    expect(screen.getByTestId("song-catalog-panel")).toHaveTextContent("repertorio:false");
  });

  it("trata usuário sem roles como sem permissão de edição", () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: "u1",
        name: "Ana",
        email: "ana@a.com",
        roles: undefined as unknown as string[],
        tenant_id: "t1",
        congregation_id: "c1",
        support_session: false,
        support_tenant_name: null,
        expires_at: Math.floor(Date.now() / 1000) + 300,
      },
      isLoading: false,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    });
    render(<RepertorioPage />);
    expect(screen.getByTestId("song-catalog-panel")).toHaveTextContent("repertorio:false");
  });
});
