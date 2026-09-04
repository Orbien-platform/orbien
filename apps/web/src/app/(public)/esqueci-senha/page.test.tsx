import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EsqueciSenhaPage from "./page";

vi.mock("axios", () => ({ default: { post: vi.fn() } }));

const postMock = vi.mocked(axios.post);

beforeEach(() => {
  postMock.mockReset().mockResolvedValue({ data: {} });
});

async function preencher(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Código da sua igreja"), " Doca-Church ");
  await user.type(screen.getByLabelText("E-mail"), " Ana@Igreja.com ");
}

describe("EsqueciSenhaPage", () => {
  it("envia e-mail e slug normalizados para a API", async () => {
    const user = userEvent.setup();
    render(<EsqueciSenhaPage />);
    await preencher(user);

    await user.click(
      screen.getByRole("button", { name: "Enviar link de redefinição" })
    );

    expect(postMock).toHaveBeenCalledWith("/api-proxy/auth/forgot-password", {
      email: "ana@igreja.com",
      tenant_slug: "doca-church",
    });
    expect(
      await screen.findByText(/receberá um link de redefinição/)
    ).toBeInTheDocument();
  });

  it("mostra o mesmo sucesso quando a API falha — a resposta não revela cadastro", async () => {
    const user = userEvent.setup();
    postMock.mockRejectedValue(new Error("500"));

    render(<EsqueciSenhaPage />);
    await preencher(user);
    await user.click(
      screen.getByRole("button", { name: "Enviar link de redefinição" })
    );

    expect(
      await screen.findByText(/receberá um link de redefinição/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Voltar para o login" })
    ).toHaveAttribute("href", "/login");
  });

  it("mantém o botão desabilitado enquanto faltar campo", async () => {
    const user = userEvent.setup();
    render(<EsqueciSenhaPage />);

    const botao = screen.getByRole("button", {
      name: "Enviar link de redefinição",
    });
    expect(botao).toBeDisabled();

    await user.type(screen.getByLabelText("Código da sua igreja"), "doca");
    expect(botao).toBeDisabled();

    await user.type(screen.getByLabelText("E-mail"), "ana@igreja.com");
    expect(botao).toBeEnabled();
  });

  it("submit com campo vazio não chama a API", () => {
    // A guarda `if (!email || !tenantSlug) return` não é alcançável pelo
    // botão, que está desabilitado nesse estado; só por submit do form —
    // que é o que um Enter em browser antigo faria.
    const { container } = render(<EsqueciSenhaPage />);

    fireEvent.submit(container.querySelector("form")!);

    expect(postMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
  });

  it("mostra o estado de envio enquanto a chamada não volta", async () => {
    const user = userEvent.setup();
    let liberar!: (v: unknown) => void;
    postMock.mockImplementation(
      () => new Promise((resolve) => (liberar = resolve))
    );

    render(<EsqueciSenhaPage />);
    await preencher(user);
    await user.click(
      screen.getByRole("button", { name: "Enviar link de redefinição" })
    );

    expect(await screen.findByText("Enviando…")).toBeInTheDocument();

    liberar({ data: {} });
    await waitFor(() =>
      expect(
        screen.getByText(/receberá um link de redefinição/)
      ).toBeInTheDocument()
    );
  });
});
