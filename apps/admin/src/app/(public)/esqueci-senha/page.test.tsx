import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EsqueciSenhaPage from "./page";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));
const postMock = vi.mocked(api.post);

beforeEach(() => {
  postMock.mockReset();
});

describe("EsqueciSenhaPage do console", () => {
  it("desabilita o botão enquanto os campos estão vazios", () => {
    render(<EsqueciSenhaPage />);
    expect(screen.getByRole("button", { name: /enviar link/i })).toBeDisabled();
  });

  it("mostra o estado de sucesso após enviar, mesmo quando a API responde 200", async () => {
    postMock.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<EsqueciSenhaPage />);
    await user.type(screen.getByLabelText("E-mail"), "Suporte@Orbien.app");
    await user.click(screen.getByRole("button", { name: /enviar link/i }));

    expect(
      await screen.findByText(/você receberá um link de/i)
    ).toBeInTheDocument();
    expect(postMock).toHaveBeenCalledWith("/auth/platform/forgot-password", {
      email: "suporte@orbien.app",
    });
  });

  it("também mostra o estado de sucesso quando a chamada falha (a API sempre devolve 200)", async () => {
    postMock.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<EsqueciSenhaPage />);
    await user.type(screen.getByLabelText("E-mail"), "a@b.com");
    await user.click(screen.getByRole("button", { name: /enviar link/i }));

    expect(
      await screen.findByText(/você receberá um link de/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar para o login" })).toHaveAttribute(
      "href",
      "/login"
    );
  });

  it("não envia quando os campos estão vazios (submit via form)", async () => {
    postMock.mockResolvedValue({ data: {} });
    render(<EsqueciSenhaPage />);
    const form = screen.getByRole("button", { name: /enviar link/i }).closest("form")!;
    if (form.requestSubmit) form.requestSubmit();
    else form.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(postMock).not.toHaveBeenCalled();
  });
});
