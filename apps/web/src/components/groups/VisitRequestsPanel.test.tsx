import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AxiosError } from "axios";
import { VisitRequestsPanel } from "./VisitRequestsPanel";
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

describe("VisitRequestsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lista os pedidos de visita, com telefone, e-mail e mensagem", async () => {
    mockedGet.mockResolvedValue({
      data: [
        {
          id: "vr1",
          visitor_name: "Ana Souza",
          visitor_phone: "11999990000",
          visitor_email: "ana@exemplo.com",
          message: "Gostaria de conhecer a célula",
          created_at: "2026-09-12T10:00:00.000Z",
        },
        {
          id: "vr2",
          visitor_name: "Bruno Lima",
          visitor_phone: null,
          visitor_email: null,
          message: null,
          created_at: "2026-09-10T10:00:00.000Z",
        },
      ],
    } as never);

    render(<VisitRequestsPanel groupId="sg1" />);

    await waitFor(() => expect(screen.getByText("Ana Souza")).toBeInTheDocument());
    expect(mockedGet).toHaveBeenCalledWith("/small-groups/sg1/visit-requests");
    expect(screen.getByRole("link", { name: /11999990000/ })).toHaveAttribute(
      "href",
      "tel:11999990000",
    );
    expect(screen.getByRole("link", { name: /ana@exemplo.com/ })).toHaveAttribute(
      "href",
      "mailto:ana@exemplo.com",
    );
    expect(screen.getByText("Gostaria de conhecer a célula")).toBeInTheDocument();
    expect(screen.getByText("Bruno Lima")).toBeInTheDocument();
    expect(screen.getByText("Sem contato informado")).toBeInTheDocument();
  });

  it("mostra estado vazio quando ninguém pediu para visitar", async () => {
    mockedGet.mockResolvedValue({ data: [] } as never);

    render(<VisitRequestsPanel groupId="sg1" />);

    await waitFor(() =>
      expect(
        screen.getByText("Ninguém pediu para visitar esta célula ainda."),
      ).toBeInTheDocument(),
    );
  });

  it("distingue 403 de lista vazia", async () => {
    mockedGet.mockRejectedValue(forbidden());

    render(<VisitRequestsPanel groupId="sg1" />);

    await waitFor(() =>
      expect(screen.queryByTestId("visit-requests-loading")).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByText("Ninguém pediu para visitar esta célula ainda."),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/os pedidos de visita desta célula/)).toBeInTheDocument();
  });

  it("mostra erro quando a requisição falha por outro motivo", async () => {
    mockedGet.mockRejectedValue(new Error("boom"));

    render(<VisitRequestsPanel groupId="sg1" />);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Não foi possível carregar os pedidos de visita.",
      ),
    );
  });
});
