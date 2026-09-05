import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EsqueciSenhaPage from "./page";

vi.mock("axios");
const mockedAxios = vi.mocked(axios, true);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EsqueciSenhaPage", () => {
  it("desabilita o botão enquanto os campos estão vazios", () => {
    render(<EsqueciSenhaPage />);
    expect(screen.getByRole("button", { name: /enviar link/i })).toBeDisabled();
  });

  it("mostra o estado de sucesso após enviar, mesmo quando a API responde 200", async () => {
    mockedAxios.post.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<EsqueciSenhaPage />);
    await user.type(screen.getByLabelText("Código da sua igreja"), "doca");
    await user.type(screen.getByLabelText("E-mail"), "Ana@Igreja.com");
    await user.click(screen.getByRole("button", { name: /enviar link/i }));

    expect(
      await screen.findByText(/você receberá um link de/i)
    ).toBeInTheDocument();
    expect(mockedAxios.post).toHaveBeenCalledWith("/api-proxy/auth/forgot-password", {
      email: "ana@igreja.com",
      tenant_slug: "doca",
    });
  });

  it("também mostra o estado de sucesso quando a chamada falha (a API sempre devolve 200)", async () => {
    mockedAxios.post.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<EsqueciSenhaPage />);
    await user.type(screen.getByLabelText("Código da sua igreja"), "doca");
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
    mockedAxios.post.mockResolvedValue({ data: {} });
    render(<EsqueciSenhaPage />);
    const form = screen.getByRole("button", { name: /enviar link/i }).closest("form")!;
    if (form.requestSubmit) form.requestSubmit();
    else form.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });
});
