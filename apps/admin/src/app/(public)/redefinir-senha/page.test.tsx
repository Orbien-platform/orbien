import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RedefinirSenhaPage from "./page";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));
const postMock = vi.mocked(api.post);

let token: string | null = "tok-123";
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (key: string) => (key === "token" ? token : null) }),
}));

beforeEach(() => {
  postMock.mockReset();
  token = "tok-123";
});

async function fillAndSubmit(password = "senha-nova-1") {
  const user = userEvent.setup();
  render(<RedefinirSenhaPage />);
  await user.type(screen.getByLabelText("Nova senha"), password);
  await user.type(screen.getByLabelText("Confirmar senha"), password);
  await user.click(screen.getByRole("button", { name: "Redefinir senha" }));
}

describe("RedefinirSenhaPage do console", () => {
  it("troca a senha pelo token do link e leva ao login", async () => {
    postMock.mockResolvedValue({ data: { message: "ok" } });
    await fillAndSubmit();

    expect(postMock).toHaveBeenCalledWith("/auth/reset-password", {
      token: "tok-123",
      password: "senha-nova-1",
    });
    expect(await screen.findByText(/senha redefinida/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir para o login" })).toHaveAttribute("href", "/login");
  });

  it("mantém o botão desabilitado enquanto as senhas não coincidem", async () => {
    const user = userEvent.setup();
    render(<RedefinirSenhaPage />);
    await user.type(screen.getByLabelText("Nova senha"), "senha-nova-1");
    await user.type(screen.getByLabelText("Confirmar senha"), "senha-nova-2");

    expect(screen.getByText("As senhas não coincidem")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Redefinir senha" })).toBeDisabled();
  });

  it("com link expirado (400), orienta a pedir um novo", async () => {
    postMock.mockRejectedValue(
      new AxiosError("bad", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 400,
        statusText: "Bad Request",
        data: {},
        headers: {},
        config: { headers: new AxiosHeaders() },
      }),
    );
    await fillAndSubmit();

    expect(await screen.findByText(/expirou ou já foi usado/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pedir novo link" })).toHaveAttribute("href", "/esqueci-senha");
  });

  it("sem token no endereço, não mostra o formulário", () => {
    token = null;
    render(<RedefinirSenhaPage />);

    expect(screen.queryByLabelText("Nova senha")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pedir novo link" })).toBeInTheDocument();
  });
});
