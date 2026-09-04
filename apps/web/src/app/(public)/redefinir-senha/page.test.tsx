import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios, { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRouter, useSearchParams } from "next/navigation";
import RedefinirSenhaPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
}));

const replace = vi.fn();
const postMock = vi.fn();

vi.mock("axios", async () => {
  const real = await vi.importActual<typeof import("axios")>("axios");
  return {
    ...real,
    default: {
      post: (...args: unknown[]) => postMock(...args),
      isAxiosError: real.default.isAxiosError,
    },
  };
});

function comToken(token: string | null) {
  vi.mocked(useSearchParams).mockReturnValue({
    get: () => token,
  } as unknown as ReturnType<typeof useSearchParams>);
}

function axiosError(status: number) {
  const headers = new AxiosHeaders();
  const config = { headers };
  return new AxiosError("falhou", "ERR_BAD_REQUEST", config, null, {
    status,
    statusText: "",
    data: {},
    headers,
    config,
  });
}

beforeEach(() => {
  replace.mockReset();
  postMock.mockReset().mockResolvedValue({ data: {} });
  vi.mocked(useRouter).mockReturnValue({
    replace,
  } as unknown as ReturnType<typeof useRouter>);
  comToken("tok-1");
});

async function preencher(
  user: ReturnType<typeof userEvent.setup>,
  senha: string,
  confirmacao: string
) {
  await user.type(screen.getByLabelText("Nova senha"), senha);
  await user.type(screen.getByLabelText("Confirmar senha"), confirmacao);
}

describe("RedefinirSenhaPage", () => {
  it("sem token na URL manda para o login e não renderiza o form", () => {
    comToken(null);
    render(<RedefinirSenhaPage />);

    expect(replace).toHaveBeenCalledWith("/login");
    expect(screen.queryByLabelText("Nova senha")).not.toBeInTheDocument();
  });

  it("redefine a senha e mostra o estado de sucesso", async () => {
    const user = userEvent.setup();
    render(<RedefinirSenhaPage />);
    await preencher(user, "senha12345", "senha12345");

    await user.click(screen.getByRole("button", { name: "Redefinir senha" }));

    expect(postMock).toHaveBeenCalledWith("/api-proxy/auth/reset-password", {
      token: "tok-1",
      password: "senha12345",
    });
    expect(
      await screen.findByText("Senha redefinida com sucesso!")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir para o login" })).toHaveAttribute(
      "href",
      "/login"
    );
  });

  it("conta os caracteres que faltam e confirma quando o mínimo é atingido", async () => {
    const user = userEvent.setup();
    render(<RedefinirSenhaPage />);

    await user.type(screen.getByLabelText("Nova senha"), "abc");
    expect(screen.getByText("5 caractere(s) restante(s)")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Nova senha"), "12345");
    expect(screen.getByText("✓ Mínimo 8 caracteres")).toBeInTheDocument();
  });

  it("avisa quando as senhas divergem e libera o botão quando coincidem", async () => {
    const user = userEvent.setup();
    render(<RedefinirSenhaPage />);

    await preencher(user, "senha12345", "senha1234");
    expect(screen.getByText("Senhas não coincidem")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Redefinir senha" })).toBeDisabled();

    await user.type(screen.getByLabelText("Confirmar senha"), "5");
    expect(screen.getByText("✓ Senhas coincidem")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Redefinir senha" })).toBeEnabled();
  });

  it("submit com senha curta não chama a API", () => {
    // Guarda defensiva: o botão está desabilitado nesse estado, então o ramo
    // só é alcançável por submit direto do form.
    const { container } = render(<RedefinirSenhaPage />);

    fireEvent.change(screen.getByLabelText("Nova senha"), {
      target: { value: "curta" },
    });
    fireEvent.submit(container.querySelector("form")!);

    expect(postMock).not.toHaveBeenCalled();
  });

  it("submit com confirmação divergente não chama a API", () => {
    const { container } = render(<RedefinirSenhaPage />);

    fireEvent.change(screen.getByLabelText("Nova senha"), {
      target: { value: "senha12345" },
    });
    fireEvent.change(screen.getByLabelText("Confirmar senha"), {
      target: { value: "outra12345" },
    });
    fireEvent.submit(container.querySelector("form")!);

    expect(postMock).not.toHaveBeenCalled();
  });

  it("alterna a visibilidade das duas senhas", async () => {
    const user = userEvent.setup();
    render(<RedefinirSenhaPage />);

    await user.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect(screen.getByLabelText("Nova senha")).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Ocultar senha" }));
    expect(screen.getByLabelText("Nova senha")).toHaveAttribute(
      "type",
      "password"
    );

    await user.click(
      screen.getByRole("button", { name: "Mostrar confirmação" })
    );
    expect(screen.getByLabelText("Confirmar senha")).toHaveAttribute(
      "type",
      "text"
    );
    await user.click(
      screen.getByRole("button", { name: "Ocultar confirmação" })
    );
    expect(screen.getByLabelText("Confirmar senha")).toHaveAttribute(
      "type",
      "password"
    );
  });

  it("400 da API vira aviso de link expirado com atalho para pedir outro", async () => {
    const user = userEvent.setup();
    postMock.mockRejectedValue(axiosError(400));

    render(<RedefinirSenhaPage />);
    await preencher(user, "senha12345", "senha12345");
    await user.click(screen.getByRole("button", { name: "Redefinir senha" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Link inválido ou expirado. Solicite um novo link."
    );
    expect(
      screen.getByRole("link", { name: "Solicitar novo link" })
    ).toHaveAttribute("href", "/esqueci-senha");
  });

  it("qualquer outro erro vira mensagem genérica", async () => {
    const user = userEvent.setup();
    postMock.mockRejectedValue(new Error("boom"));

    render(<RedefinirSenhaPage />);
    await preencher(user, "senha12345", "senha12345");
    await user.click(screen.getByRole("button", { name: "Redefinir senha" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Erro ao redefinir senha. Tente novamente."
    );
  });

  it("mostra o estado de envio enquanto a chamada não volta", async () => {
    const user = userEvent.setup();
    let liberar!: (v: unknown) => void;
    postMock.mockImplementation(
      () => new Promise((resolve) => (liberar = resolve))
    );

    render(<RedefinirSenhaPage />);
    await preencher(user, "senha12345", "senha12345");
    await user.click(screen.getByRole("button", { name: "Redefinir senha" }));

    expect(await screen.findByText("Redefinindo…")).toBeInTheDocument();
    expect(screen.getByLabelText("Nova senha")).toBeDisabled();

    liberar({ data: {} });
    await waitFor(() =>
      expect(
        screen.getByText("Senha redefinida com sucesso!")
      ).toBeInTheDocument()
    );
  });
});

// `axios` real fica disponível para quem precisar do tipo; o mock acima só
// troca `post`, e `isAxiosError` continua sendo o de verdade.
void axios;
