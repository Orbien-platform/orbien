import { render, screen, waitFor } from "@testing-library/react";
import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SessaoSuportePage from "./page";

vi.mock("axios", () => ({ default: { post: vi.fn() } }));

const postMock = vi.mocked(axios.post);
const replaceState = vi.fn();

const locationOriginal = window.location;
const replaceStateOriginal = window.history.replaceState;

/** Monta o fragmento como o `apps/admin` monta ao abrir a sessão. */
function comFragmento(fragmento: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      hash: fragmento,
      pathname: "/suporte/sessao",
      replace: vi.fn(),
    },
  });
}

function makeToken(payload: Record<string, unknown>): string {
  return `h.${btoa(JSON.stringify(payload))}.s`;
}

function tokenValido(overrides: Record<string, unknown> = {}) {
  return makeToken({
    sub: "u-1",
    tenant_id: "t-1",
    congregation_id: "c-1",
    roles: ["platform_support"],
    plan: "pro",
    iat: 0,
    exp: Math.floor(Date.now() / 1000) + 900,
    support_session: true,
    ...overrides,
  });
}

beforeEach(() => {
  postMock.mockReset().mockResolvedValue({ data: {} });
  replaceState.mockReset();
  window.history.replaceState = replaceState;
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: locationOriginal,
  });
  window.history.replaceState = replaceStateOriginal;
});

describe("SessaoSuportePage", () => {
  it("troca o token do fragmento por cookie e vai para o dashboard", async () => {
    const token = tokenValido();
    comFragmento(
      `#access_token=${token}&tenant_name=${encodeURIComponent("Igreja Central")}`
    );

    render(<SessaoSuportePage />);

    expect(
      screen.getByText("Iniciando sessão de suporte…")
    ).toBeInTheDocument();

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith("/api/session/suporte", {
        access_token: token,
        tenant_name: "Igreja Central",
      })
    );
    await waitFor(() =>
      expect(window.location.replace).toHaveBeenCalledWith("/dashboard")
    );
  });

  it("sem tenant_name não manda o campo", async () => {
    const token = tokenValido();
    comFragmento(`#access_token=${token}`);

    render(<SessaoSuportePage />);

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith("/api/session/suporte", {
        access_token: token,
      })
    );
  });

  it("apaga o fragmento da barra de endereço antes de decidir o que fazer", async () => {
    comFragmento(`#access_token=${tokenValido()}`);

    render(<SessaoSuportePage />);

    await waitFor(() =>
      expect(replaceState).toHaveBeenCalledWith(null, "", "/suporte/sessao")
    );
  });

  it("apaga o fragmento também quando o token é inválido", async () => {
    comFragmento("#access_token=nao-e-jwt");

    render(<SessaoSuportePage />);

    await waitFor(() =>
      expect(replaceState).toHaveBeenCalledWith(null, "", "/suporte/sessao")
    );
    expect(postMock).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Token de sessão de suporte ilegível."
    );
  });

  it("fragmento sem token vira aviso de link incompleto", async () => {
    comFragmento("#tenant_name=Igreja");

    render(<SessaoSuportePage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Link de sessão de suporte inválido ou incompleto."
    );
    expect(postMock).not.toHaveBeenCalled();
  });

  it("token expirado vira aviso de sessão vencida", async () => {
    comFragmento(
      `#access_token=${tokenValido({ exp: Math.floor(Date.now() / 1000) - 1 })}`
    );

    render(<SessaoSuportePage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Esta sessão de suporte já expirou. Abra outra pelo console."
    );
    expect(postMock).not.toHaveBeenCalled();
  });

  it("antes de hidratar só mostra o spinner — não há `location.hash` no servidor", async () => {
    comFragmento(`#access_token=${tokenValido()}`);
    // A primeira renderização (e a do servidor) vê `useHydrated() === false`;
    // no jsdom o hook já volta `true`, então o ramo só é observável mockando.
    vi.doMock("@/hooks/useHydrated", () => ({ useHydrated: () => false }));
    vi.resetModules();
    const { default: Page } = await import("./page");

    render(<Page />);

    expect(screen.getByText("Iniciando sessão de suporte…")).toBeInTheDocument();
    // Nada de efeito colateral: nem limpeza de fragmento, nem troca por
    // cookie. `postMock` não serve de asserção aqui — o módulo reimportado
    // recebeu outra instância do mock de axios.
    expect(replaceState).not.toHaveBeenCalled();

    vi.doUnmock("@/hooks/useHydrated");
    vi.resetModules();
  });

  it("falha na troca pelo cookie vira aviso, sem navegar", async () => {
    comFragmento(`#access_token=${tokenValido()}`);
    postMock.mockRejectedValue(new Error("400"));

    render(<SessaoSuportePage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível abrir a sessão de suporte. Tente pelo console."
    );
    expect(window.location.replace).not.toHaveBeenCalled();
  });
});
