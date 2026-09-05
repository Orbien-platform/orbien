import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./page";
import { useAuth } from "@/hooks/useAuth";

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

const login = vi.fn();

function axiosError(status: number, data: unknown = {}) {
  const headers = new AxiosHeaders();
  const config = { headers };
  return new AxiosError("falhou", "ERR_BAD_REQUEST", config, null, {
    status,
    statusText: "",
    data,
    headers,
    config,
  });
}

async function preencher(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("E-mail"), " suporte@orbien.app ");
  await user.type(screen.getByLabelText("Senha"), "senha12345");
}

beforeEach(() => {
  login.mockReset().mockResolvedValue(undefined);
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    isLoading: false,
    isAuthenticated: false,
    login,
    logout: vi.fn(),
  });
});

describe("LoginPage do console", () => {
  it("se apresenta como console da plataforma, sem campo de igreja", () => {
    render(<LoginPage />);

    expect(screen.getByText("Console da plataforma")).toBeInTheDocument();
    expect(screen.getByText("Acesso restrito · Orbien Plataforma")).toBeInTheDocument();
    // Quem administra a plataforma não está dentro de tenant nenhum.
    expect(screen.queryByLabelText(/igreja/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  it("entra com e-mail aparado e a senha como digitada", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await preencher(user);
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(login).toHaveBeenCalledWith("suporte@orbien.app", "senha12345");
  });

  it("exige os dois campos antes de chamar a API", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Informe e-mail e senha."
    );
    expect(login).not.toHaveBeenCalled();
  });

  it("mostra o estado de envio enquanto o login não resolve", async () => {
    const user = userEvent.setup();
    let liberar!: () => void;
    login.mockImplementation(
      () => new Promise<void>((resolve) => (liberar = resolve))
    );

    render(<LoginPage />);
    await preencher(user);
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Entrando…")).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail")).toBeDisabled();

    liberar();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled()
    );
  });

  it("401 não distingue senha errada de conta sem acesso — de propósito", async () => {
    const user = userEvent.setup();
    login.mockRejectedValue(axiosError(401));

    render(<LoginPage />);
    await preencher(user);
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "E-mail ou senha incorretos, ou conta sem acesso à plataforma."
    );
  });

  it("conta ambígua mostra a mensagem que veio da API", async () => {
    const user = userEvent.setup();
    login.mockRejectedValue(
      axiosError(409, {
        code: "PLATFORM_ACCOUNT_AMBIGUOUS",
        message: "Esse e-mail tem acesso de plataforma em mais de um tenant.",
      })
    );

    render(<LoginPage />);
    await preencher(user);
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    // É erro de configuração, não do usuário: só a API sabe o que dizer.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Esse e-mail tem acesso de plataforma em mais de um tenant."
    );
  });

  it.each([
    [
      "sem resposta",
      new AxiosError("Network Error", "ERR_NETWORK", {
        headers: new AxiosHeaders(),
      }),
      "Não foi possível conectar. Verifique sua internet.",
    ],
    ["5xx", axiosError(503), "Serviço temporariamente indisponível. Tente novamente."],
    ["4xx qualquer", axiosError(422), "Erro ao entrar. Tente novamente."],
    [
      "erro que não é do axios",
      new Error("boom"),
      "Não foi possível conectar. Verifique sua internet.",
    ],
  ])("traduz %s na mensagem da tela", async (_caso, erro, mensagem) => {
    const user = userEvent.setup();
    login.mockRejectedValue(erro);

    render(<LoginPage />);
    await preencher(user);
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(mensagem);
  });

  it("limpa o erro anterior a cada envio", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await preencher(user);
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    );
  });
});
