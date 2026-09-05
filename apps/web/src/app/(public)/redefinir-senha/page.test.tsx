import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import { useRouter, useSearchParams } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RedefinirSenhaPage from "./page";

vi.mock("axios");
const mockedAxios = vi.mocked(axios, true);

vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(),
  useRouter: vi.fn(),
}));

const mockedUseSearchParams = vi.mocked(useSearchParams);
const mockedUseRouter = vi.mocked(useRouter);

function setup(token: string | null) {
  mockedUseSearchParams.mockReturnValue(
    new URLSearchParams(token ? { token } : {}) as unknown as ReturnType<typeof useSearchParams>
  );
  const replace = vi.fn();
  mockedUseRouter.mockReturnValue({ replace } as unknown as ReturnType<typeof useRouter>);
  return { replace };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RedefinirSenhaPage", () => {
  it("redireciona para /login quando não há token na URL", () => {
    const { replace } = setup(null);
    render(<RedefinirSenhaPage />);
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("mostra os indicadores de tamanho e de senhas coincidindo/divergindo", async () => {
    setup("tok123");
    const user = userEvent.setup();
    render(<RedefinirSenhaPage />);

    await user.type(screen.getByLabelText("Nova senha"), "1234567");
    expect(screen.getByText("1 caractere(s) restante(s)")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Nova senha"), "8");
    expect(screen.getByText("✓ Mínimo 8 caracteres")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Confirmar senha"), "diferente");
    expect(screen.getByText("Senhas não coincidem")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Confirmar senha"));
    await user.type(screen.getByLabelText("Confirmar senha"), "12345678");
    expect(screen.getByText("✓ Senhas coincidem")).toBeInTheDocument();
  });

  it("alterna a visibilidade dos dois campos de senha", async () => {
    setup("tok123");
    const user = userEvent.setup();
    render(<RedefinirSenhaPage />);

    const passwordInput = screen.getByLabelText("Nova senha");
    expect(passwordInput).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect(passwordInput).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Ocultar senha" }));
    expect(passwordInput).toHaveAttribute("type", "password");

    const confirmInput = screen.getByLabelText("Confirmar senha");
    expect(confirmInput).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Mostrar confirmação" }));
    expect(confirmInput).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Ocultar confirmação" }));
    expect(confirmInput).toHaveAttribute("type", "password");
  });

  it("não submete quando a senha é curta ou as senhas divergem", async () => {
    setup("tok123");
    mockedAxios.post.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<RedefinirSenhaPage />);

    await user.type(screen.getByLabelText("Nova senha"), "123");
    await user.type(screen.getByLabelText("Confirmar senha"), "123");
    await user.click(screen.getByRole("button", { name: /redefinir senha/i }));
    expect(mockedAxios.post).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Nova senha"));
    await user.clear(screen.getByLabelText("Confirmar senha"));
    await user.type(screen.getByLabelText("Nova senha"), "12345678");
    await user.type(screen.getByLabelText("Confirmar senha"), "87654321");
    await user.click(screen.getByRole("button", { name: /redefinir senha/i }));
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it("não submete quando a senha é válida mas a confirmação está vazia", async () => {
    // O botão fica desabilitado nesse caso (!passwordsMatch), mas o guard de
    // handleSubmit também precisa cobrir esse ramo — ele é alcançável via
    // submit do form, não só pelo clique no botão.
    setup("tok123");
    mockedAxios.post.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<RedefinirSenhaPage />);

    await user.type(screen.getByLabelText("Nova senha"), "12345678");
    const form = screen.getByLabelText("Nova senha").closest("form")!;
    form.requestSubmit();

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it("submete com sucesso e mostra o estado de conclusão", async () => {
    setup("tok123");
    mockedAxios.post.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<RedefinirSenhaPage />);

    await user.type(screen.getByLabelText("Nova senha"), "12345678");
    await user.type(screen.getByLabelText("Confirmar senha"), "12345678");
    await user.click(screen.getByRole("button", { name: /redefinir senha/i }));

    expect(await screen.findByText("Senha redefinida com sucesso!")).toBeInTheDocument();
    expect(mockedAxios.post).toHaveBeenCalledWith("/api-proxy/auth/reset-password", {
      token: "tok123",
      password: "12345678",
    });
    expect(screen.getByRole("link", { name: "Ir para o login" })).toHaveAttribute("href", "/login");
  });

  it("mostra mensagem de link inválido para erro 400", async () => {
    setup("tok123");
    const err = Object.assign(new Error("bad"), {
      isAxiosError: true,
      response: { status: 400 },
    });
    vi.spyOn(axios, "isAxiosError").mockReturnValue(true);
    mockedAxios.post.mockRejectedValue(err);
    const user = userEvent.setup();
    render(<RedefinirSenhaPage />);

    await user.type(screen.getByLabelText("Nova senha"), "12345678");
    await user.type(screen.getByLabelText("Confirmar senha"), "12345678");
    await user.click(screen.getByRole("button", { name: /redefinir senha/i }));

    expect(
      await screen.findByText("Link inválido ou expirado. Solicite um novo link.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Solicitar novo link" })).toHaveAttribute(
      "href",
      "/esqueci-senha"
    );
  });

  it("mostra mensagem genérica para outros erros", async () => {
    setup("tok123");
    vi.spyOn(axios, "isAxiosError").mockReturnValue(false);
    mockedAxios.post.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<RedefinirSenhaPage />);

    await user.type(screen.getByLabelText("Nova senha"), "12345678");
    await user.type(screen.getByLabelText("Confirmar senha"), "12345678");
    await user.click(screen.getByRole("button", { name: /redefinir senha/i }));

    expect(
      await screen.findByText("Erro ao redefinir senha. Tente novamente.")
    ).toBeInTheDocument();
  });
});
