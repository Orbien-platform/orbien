import { useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRouter } from "next/navigation";
import { AuthProvider, emitSessionChange, PLATFORM_ROLE } from "./AuthContext";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { saveTokens } from "@/lib/auth";

vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

const postMock = vi.mocked(api.post);
const push = vi.fn();

function makeToken(roles: string[] = [PLATFORM_ROLE]): string {
  return `h.${btoa(
    JSON.stringify({
      sub: "u-1",
      tenant_id: "t-1",
      congregation_id: "c-1",
      roles,
      plan: "pro",
      iat: 0,
      exp: Math.floor(Date.now() / 1000) + 900,
    })
  )}.s`;
}

/** Sonda: mostra o que o contexto expõe e dispara os dois verbos. */
function Sonda() {
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();
  const [erroDeLogin, setErroDeLogin] = useState("");
  return (
    <div>
      <span>erro:{erroDeLogin}</span>
      <span>carregando:{String(isLoading)}</span>
      <span>autenticado:{String(isAuthenticated)}</span>
      <span>usuario:{user ? `${user.name}|${user.email}|${user.roles.join(",")}` : "nenhum"}</span>
      <button
        onClick={() =>
          login("suporte.plataforma@orbien.app", "senha").catch((e: Error) =>
            setErroDeLogin(e.message)
          )
        }
      >
        entrar
      </button>
      <button onClick={() => logout()}>sair</button>
    </div>
  );
}

function montar() {
  return render(
    <AuthProvider>
      <Sonda />
    </AuthProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  postMock.mockReset().mockResolvedValue({ data: {} } as never);
  push.mockReset();
  vi.mocked(useRouter).mockReturnValue({
    push,
  } as unknown as ReturnType<typeof useRouter>);
});

describe("AuthProvider", () => {
  it("sem sessão no storage não há usuário", () => {
    montar();

    expect(screen.getByText("autenticado:false")).toBeInTheDocument();
    expect(screen.getByText("usuario:nenhum")).toBeInTheDocument();
    // `useSyncExternalStore` já devolve o snapshot do cliente na primeira
    // renderização do jsdom.
    expect(screen.getByText("carregando:false")).toBeInTheDocument();
  });

  it("monta o usuário a partir do token e do e-mail guardados", () => {
    saveTokens(makeToken(), "rt-1", "suporte.plataforma@orbien.app");

    montar();

    expect(screen.getByText("autenticado:true")).toBeInTheDocument();
    expect(
      screen.getByText(
        `usuario:suporte plataforma|suporte.plataforma@orbien.app|${PLATFORM_ROLE}`
      )
    ).toBeInTheDocument();
  });

  it("sessão sem platform_support não vale — papel revogado derruba o console", () => {
    saveTokens(makeToken(["tenant_admin"]), "rt-1", "admin@igreja.com");

    montar();

    expect(screen.getByText("autenticado:false")).toBeInTheDocument();
  });

  it("token ilegível também não monta usuário", () => {
    localStorage.setItem("access_token", "nao-e-jwt");
    localStorage.setItem("user_email", "suporte@orbien.app");

    montar();

    expect(screen.getByText("usuario:nenhum")).toBeInTheDocument();
  });

  it("sessão pela metade (token sem e-mail) não monta usuário", () => {
    localStorage.setItem("access_token", makeToken());

    montar();

    expect(screen.getByText("usuario:nenhum")).toBeInTheDocument();
  });

  it("login sem slug de tenant, gravando a sessão e indo para /tenants", async () => {
    const user = userEvent.setup();
    postMock.mockResolvedValue({
      data: { access_token: makeToken(), refresh_token: "rt-1", expires_in: 900 },
    } as never);

    montar();
    await user.click(screen.getByRole("button", { name: "entrar" }));

    // Sem `tenant_slug`: quem administra a plataforma não está dentro de
    // tenant nenhum, e o desempate vem do papel, no servidor.
    expect(postMock).toHaveBeenCalledWith("/auth/platform/login", {
      email: "suporte.plataforma@orbien.app",
      password: "senha",
    });
    await waitFor(() =>
      expect(screen.getByText("autenticado:true")).toBeInTheDocument()
    );
    expect(push).toHaveBeenCalledWith("/tenants");
  });

  it("login recusado propaga o erro e não grava sessão", async () => {
    const user = userEvent.setup();
    postMock.mockRejectedValue(new Error("401"));

    montar();
    await user.click(screen.getByRole("button", { name: "entrar" }));

    // O erro sobe para quem chamou — é a tela de login que decide a
    // mensagem.
    await waitFor(() => expect(screen.getByText("erro:401")).toBeInTheDocument());
    expect(screen.getByText("autenticado:false")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(localStorage.getItem("access_token")).toBeNull();
  });

  it("logout revoga o refresh na API, limpa a sessão e volta ao login", async () => {
    const user = userEvent.setup();
    saveTokens(makeToken(), "rt-1", "suporte@orbien.app");

    montar();
    await user.click(screen.getByRole("button", { name: "sair" }));

    expect(postMock).toHaveBeenCalledWith("/auth/logout", {
      refresh_token: "rt-1",
    });
    await waitFor(() =>
      expect(screen.getByText("autenticado:false")).toBeInTheDocument()
    );
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(push).toHaveBeenCalledWith("/login");
  });

  it("API fora do ar não impede o logout local", async () => {
    const user = userEvent.setup();
    saveTokens(makeToken(), "rt-1", "suporte@orbien.app");
    postMock.mockRejectedValue(new Error("ECONNREFUSED"));

    montar();
    await user.click(screen.getByRole("button", { name: "sair" }));

    await waitFor(() =>
      expect(localStorage.getItem("access_token")).toBeNull()
    );
    expect(push).toHaveBeenCalledWith("/login");
  });

  it("mudança de sessão em outra aba derruba esta", async () => {
    saveTokens(makeToken(), "rt-1", "suporte@orbien.app");
    montar();
    expect(screen.getByText("autenticado:true")).toBeInTheDocument();

    // O `storage` só dispara entre abas; aqui o efeito é o mesmo.
    localStorage.clear();
    act(() => {
      window.dispatchEvent(new StorageEvent("storage"));
    });

    expect(screen.getByText("autenticado:false")).toBeInTheDocument();
  });

  it("`emitSessionChange` avisa quem está inscrito", () => {
    montar();
    expect(screen.getByText("autenticado:false")).toBeInTheDocument();

    saveTokens(makeToken(), "rt-1", "suporte@orbien.app");
    act(() => {
      emitSessionChange();
    });

    expect(screen.getByText("autenticado:true")).toBeInTheDocument();
  });

  it("solta o ouvinte de `storage` ao desmontar", () => {
    const remover = vi.spyOn(window, "removeEventListener");
    const { unmount } = montar();

    unmount();

    expect(remover).toHaveBeenCalledWith("storage", expect.any(Function));
    remover.mockRestore();
  });
});

describe("renderização no servidor", () => {
  it("o snapshot de servidor não vê sessão e marca `isLoading`", async () => {
    // `useSyncExternalStore` só usa `getServerSnapshot` fora do browser. É o
    // que garante que a primeira renderização seja igual nos dois lados — e é
    // por isso que o layout mostra spinner em vez de concluir que ninguém
    // está logado.
    const { renderToString } = await import("react-dom/server");
    saveTokens(makeToken(), "rt-1", "suporte@orbien.app");

    const html = renderToString(
      <AuthProvider>
        <Sonda />
      </AuthProvider>
    );

    // O `renderToString` separa os nós de texto com comentários.
    const texto = html.replace(/<!--.*?-->/g, "");
    expect(texto).toContain("carregando:true");
    expect(texto).toContain("autenticado:false");
    expect(texto).toContain("usuario:nenhum");
  });
});

describe("useAuth", () => {
  it("recusa uso fora do provider", () => {
    // O React registra o erro do render; silenciar mantém a saída legível.
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<Sonda />)).toThrow(
      "useAuth must be used within AuthProvider"
    );

    erro.mockRestore();
  });
});
