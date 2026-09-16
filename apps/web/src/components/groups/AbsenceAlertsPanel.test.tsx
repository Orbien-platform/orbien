import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AxiosError } from "axios";
import { AbsenceAlertsPanel } from "./AbsenceAlertsPanel";
import api from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const axios = await import("axios");
  return {
    default: { get: vi.fn() },
    isForbidden: (error: unknown) =>
      axios.default.isAxiosError(error) && error.response?.status === 403,
  };
});

function forbidden() {
  const err = new AxiosError("Forbidden");
  err.response = {
    status: 403,
    data: {},
    statusText: "Forbidden",
    headers: {},
    config: { headers: {} as never },
  };
  return err;
}

const mockedGet = vi.mocked(api.get);

describe("AbsenceAlertsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lista quem faltou, com telefone e e-mail clicáveis", async () => {
    mockedGet.mockResolvedValue({
      data: [
        { id: "p1", full_name: "Ana Souza", phone: "11999990000", email: "ana@exemplo.com" },
        { id: "p2", full_name: "Bruno Lima", phone: null, email: null },
      ],
    } as never);

    render(<AbsenceAlertsPanel groupId="sg1" />);

    await waitFor(() => expect(screen.getByText("Ana Souza")).toBeInTheDocument());
    expect(mockedGet).toHaveBeenCalledWith("/small-groups/sg1/absence-alerts");
    expect(screen.getByRole("link", { name: /11999990000/ })).toHaveAttribute(
      "href",
      "tel:11999990000",
    );
    expect(screen.getByRole("link", { name: /ana@exemplo.com/ })).toHaveAttribute(
      "href",
      "mailto:ana@exemplo.com",
    );
    expect(screen.getByText("Sem contato cadastrado")).toBeInTheDocument();
  });

  it("mostra estado vazio quando ninguém faltou", async () => {
    mockedGet.mockResolvedValue({ data: [] } as never);

    render(<AbsenceAlertsPanel groupId="sg1" />);

    await waitFor(() =>
      expect(screen.getByText("Ninguém ficou de fora das últimas reuniões.")).toBeInTheDocument(),
    );
  });

  it("distingue 403 de lista vazia", async () => {
    mockedGet.mockRejectedValue(forbidden());

    render(<AbsenceAlertsPanel groupId="sg1" />);

    await waitFor(() =>
      expect(screen.queryByTestId("absence-loading")).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByText("Ninguém ficou de fora das últimas reuniões."),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/as ausências desta célula/)).toBeInTheDocument();
  });

  it("mostra erro quando a requisição falha por outro motivo", async () => {
    mockedGet.mockRejectedValue(new Error("boom"));

    render(<AbsenceAlertsPanel groupId="sg1" />);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Não foi possível carregar as ausências.",
      ),
    );
  });
});
