import { render, screen } from "@testing-library/react";
import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JwtPayload } from "@/lib/auth";
import { useHydrated } from "@/hooks/useHydrated";
import SessaoSuportePage from "./page";

vi.mock("axios");
const mockedAxios = vi.mocked(axios, true);

vi.mock("@/hooks/useHydrated", () => ({
  useHydrated: vi.fn(() => true),
}));
const mockedUseHydrated = vi.mocked(useHydrated);

function makeToken(payload: Partial<JwtPayload>): string {
  const header = btoa(JSON.stringify({ alg: "none" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

let locationReplace: ReturnType<typeof vi.fn>;
const originalLocation = window.location;

/**
 * `location.replace` é propriedade própria não configurável do `Location`
 * real do jsdom — nem `defineProperty` nem `Proxy` conseguem sobrescrever só
 * ela (o Proxy viola o invariante de "non-configurable data property" e
 * lança). A saída é trocar `window.location` inteiro por um objeto simples: a
 * página só lê `hash` (uma vez, na leitura do handoff) e `pathname` (para
 * limpar a barra de endereço), então basta fornecer os dois.
 */
function setHash(hash: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { hash, pathname: "/suporte/sessao", replace: locationReplace },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedUseHydrated.mockReturnValue(true);
  locationReplace = vi.fn();
  setHash("");
  vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
});

describe("SessaoSuportePage", () => {
  it("mostra erro quando o fragmento não tem access_token", async () => {
    setHash("");
    render(<SessaoSuportePage />);
    expect(
      await screen.findByText("Link de sessão de suporte inválido ou incompleto.")
    ).toBeInTheDocument();
  });

  it("mostra erro quando o token é ilegível", async () => {
    setHash("#access_token=garbage");
    render(<SessaoSuportePage />);
    expect(
      await screen.findByText("Token de sessão de suporte ilegível.")
    ).toBeInTheDocument();
  });

  it("mostra erro quando o token já expirou", async () => {
    const token = makeToken({ exp: Math.floor(Date.now() / 1000) - 60 });
    setHash(`#access_token=${token}`);
    render(<SessaoSuportePage />);
    expect(
      await screen.findByText("Esta sessão de suporte já expirou. Abra outra pelo console.")
    ).toBeInTheDocument();
  });

  it("limpa o fragmento da URL mesmo em caminho de erro", async () => {
    setHash("#access_token=garbage");
    render(<SessaoSuportePage />);
    await screen.findByText("Token de sessão de suporte ilegível.");
    expect(window.history.replaceState).toHaveBeenCalledWith(null, "", "/suporte/sessao");
  });

  it("troca o token por cookie e redireciona para /dashboard em caso de sucesso", async () => {
    const token = makeToken({ exp: Math.floor(Date.now() / 1000) + 900 });
    setHash(`#access_token=${token}&tenant_name=Doca+Church`);
    mockedAxios.post.mockResolvedValue({ data: {} });

    render(<SessaoSuportePage />);

    expect(
      await screen.findByText("Iniciando sessão de suporte…")
    ).toBeInTheDocument();

    await vi.waitFor(() => expect(mockedAxios.post).toHaveBeenCalled());
    expect(mockedAxios.post).toHaveBeenCalledWith("/api/session/suporte", {
      access_token: token,
      tenant_name: "Doca Church",
    });
    await vi.waitFor(() => expect(locationReplace).toHaveBeenCalledWith("/dashboard"));
  });

  it("troca o token sem tenant_name quando o fragmento não o trouxe", async () => {
    const token = makeToken({ exp: Math.floor(Date.now() / 1000) + 900 });
    setHash(`#access_token=${token}`);
    mockedAxios.post.mockResolvedValue({ data: {} });

    render(<SessaoSuportePage />);
    await vi.waitFor(() => expect(mockedAxios.post).toHaveBeenCalled());
    expect(mockedAxios.post).toHaveBeenCalledWith("/api/session/suporte", {
      access_token: token,
    });
  });

  it("antes da hidratação não lê o fragmento nem dispara o efeito", async () => {
    mockedUseHydrated.mockReturnValue(false);
    const token = makeToken({ exp: Math.floor(Date.now() / 1000) + 900 });
    setHash(`#access_token=${token}`);
    mockedAxios.post.mockResolvedValue({ data: {} });

    const { rerender } = render(<SessaoSuportePage />);
    // Antes de hidratar, a página só mostra o spinner — nem lê o hash nem
    // chama a API (o `useMemo` devolve `null` e o efeito sai no `!result`).
    expect(screen.getByText("Iniciando sessão de suporte…")).toBeInTheDocument();
    expect(mockedAxios.post).not.toHaveBeenCalled();

    mockedUseHydrated.mockReturnValue(true);
    rerender(<SessaoSuportePage />);
    await vi.waitFor(() => expect(mockedAxios.post).toHaveBeenCalled());
  });

  it("mostra erro quando a troca de token falha", async () => {
    const token = makeToken({ exp: Math.floor(Date.now() / 1000) + 900 });
    setHash(`#access_token=${token}`);
    mockedAxios.post.mockRejectedValue(new Error("boom"));

    render(<SessaoSuportePage />);
    expect(
      await screen.findByText(
        "Não foi possível abrir a sessão de suporte. Tente pelo console."
      )
    ).toBeInTheDocument();
  });
});
