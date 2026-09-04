import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import { describe, expect, it, vi } from "vitest";
import { useAuth } from "@/hooks/useAuth";
import LoginPage from "./page";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

function setup(login = vi.fn()) {
  mockedUseAuth.mockReturnValue({
    user: null,
    isLoading: false,
    isAuthenticated: false,
    login,
    logout: vi.fn(),
  });
  return { login };
}

async function fillAndSubmit(opts: { tenant?: string; email?: string; password?: string } = {}) {
  const user = userEvent.setup();
  if (opts.tenant !== undefined) {
    await user.type(screen.getByLabelText("Código da sua igreja"), opts.tenant);
  }
  if (opts.email !== undefined) {
    await user.type(screen.getByLabelText("E-mail"), opts.email);
  }
  if (opts.password !== undefined) {
    await user.type(screen.getByLabelText("Senha"), opts.password);
  }
  await user.click(screen.getByRole("button", { name: /entrar/i }));
}

describe("LoginPage", () => {
  it("mostra erro de validação quando algum campo obrigatório falta", async () => {
    setup();
    render(<LoginPage />);
    await fillAndSubmit({ tenant: "doca", email: "a@b.com" });
    expect(
      await screen.findByText("Todos os campos são obrigatórios.")
    ).toBeInTheDocument();
  });

  it("chama login com os valores normalizados em caso de sucesso", async () => {
    const { login } = setup(vi.fn().mockResolvedValue(undefined));
    render(<LoginPage />);
    await fillAndSubmit({ tenant: "  DOCA-Church  ", email: " Ana@Igreja.com ", password: "123456" });
    await waitFor(() =>
      expect(login).toHaveBeenCalledWith("Ana@Igreja.com", "123456", "doca-church")
    );
  });

  it("mostra mensagem de rede quando a resposta não tem status (offline)", async () => {
    const err = Object.assign(new Error("network"), { isAxiosError: true, response: undefined });
    vi.spyOn(axios, "isAxiosError").mockReturnValue(true);
    setup(vi.fn().mockRejectedValue(err));
    render(<LoginPage />);
    await fillAndSubmit({ tenant: "doca", email: "a@b.com", password: "123456" });
    expect(
      await screen.findByText("Não foi possível conectar. Verifique sua internet.")
    ).toBeInTheDocument();
  });

  it("mostra mensagem de indisponibilidade para erro 5xx", async () => {
    const err = { isAxiosError: true, response: { status: 500, data: {} } };
    vi.spyOn(axios, "isAxiosError").mockReturnValue(true);
    setup(vi.fn().mockRejectedValue(err));
    render(<LoginPage />);
    await fillAndSubmit({ tenant: "doca", email: "a@b.com", password: "123456" });
    expect(
      await screen.findByText("Serviço temporariamente indisponível. Tente novamente.")
    ).toBeInTheDocument();
  });

  it("mostra mensagem de igreja não encontrada para TENANT_NOT_FOUND", async () => {
    const err = { isAxiosError: true, response: { status: 404, data: { code: "TENANT_NOT_FOUND" } } };
    vi.spyOn(axios, "isAxiosError").mockReturnValue(true);
    setup(vi.fn().mockRejectedValue(err));
    render(<LoginPage />);
    await fillAndSubmit({ tenant: "doca", email: "a@b.com", password: "123456" });
    expect(
      await screen.findByText("Código de igreja não encontrado. Verifique e tente novamente.")
    ).toBeInTheDocument();
  });

  it("mostra e-mail ou senha incorretos para 401", async () => {
    const err = { isAxiosError: true, response: { status: 401, data: {} } };
    vi.spyOn(axios, "isAxiosError").mockReturnValue(true);
    setup(vi.fn().mockRejectedValue(err));
    render(<LoginPage />);
    await fillAndSubmit({ tenant: "doca", email: "a@b.com", password: "123456" });
    expect(await screen.findByText("E-mail ou senha incorretos.")).toBeInTheDocument();
  });

  it("mostra mensagem genérica para outros status de erro", async () => {
    const err = { isAxiosError: true, response: { status: 418, data: {} } };
    vi.spyOn(axios, "isAxiosError").mockReturnValue(true);
    setup(vi.fn().mockRejectedValue(err));
    render(<LoginPage />);
    await fillAndSubmit({ tenant: "doca", email: "a@b.com", password: "123456" });
    expect(await screen.findByText("Erro ao entrar. Tente novamente.")).toBeInTheDocument();
  });

  it("mostra mensagem de conexão para erro que não é do axios", async () => {
    vi.spyOn(axios, "isAxiosError").mockReturnValue(false);
    setup(vi.fn().mockRejectedValue(new Error("boom")));
    render(<LoginPage />);
    await fillAndSubmit({ tenant: "doca", email: "a@b.com", password: "123456" });
    expect(
      await screen.findByText("Não foi possível conectar. Verifique sua internet.")
    ).toBeInTheDocument();
  });

  it("tem link para recuperação de senha", () => {
    setup();
    render(<LoginPage />);
    expect(screen.getByRole("link", { name: "Esqueceu sua senha?" })).toHaveAttribute(
      "href",
      "/esqueci-senha"
    );
  });
});
