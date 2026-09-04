import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./page";
import { useAuth } from "@/hooks/useAuth";

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

const login = vi.fn();

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

/** AxiosError com resposta, do jeito que `axios.isAxiosError` reconhece. */
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
  await user.type(screen.getByLabelText("Código da sua igreja"), " Doca-Church ");
  await user.type(screen.getByLabelText("E-mail"), " ana@igreja.com ");
  await user.type(screen.getByLabelText("Senha"), "senha123");
}

describe("LoginPage", () => {
  it("normaliza os campos e chama o login com o slug em minúsculas", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await preencher(user);

    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(login).toHaveBeenCalledWith(
      "ana@igreja.com",
      "senha123",
      "doca-church"
    );
  });

  it("exige os três campos antes de chamar a API", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Todos os campos são obrigatórios."
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

  it.each([
    [
      "sem resposta da API",
      new AxiosError("Network Error", "ERR_NETWORK", { headers: new AxiosHeaders() }),
      "Não foi possível conectar. Verifique sua internet.",
    ],
    [
      "5xx",
      axiosError(503),
      "Serviço temporariamente indisponível. Tente novamente.",
    ],
    [
      "TENANT_NOT_FOUND",
      axiosError(404, { code: "TENANT_NOT_FOUND" }),
      "Código de igreja não encontrado. Verifique e tente novamente.",
    ],
    ["401", axiosError(401), "E-mail ou senha incorretos."],
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

  it("aponta para a recuperação de senha", () => {
    render(<LoginPage />);
    expect(
      screen.getByRole("link", { name: "Esqueceu sua senha?" })
    ).toHaveAttribute("href", "/esqueci-senha");
  });
});
