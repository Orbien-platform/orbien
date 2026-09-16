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

const REQUESTS = [
  {
    id: "vr1",
    visitor_name: "Marina Alves",
    visitor_phone: "11988887777",
    visitor_email: null,
    message: "Posso levar meu filho?",
    created_at: "2026-09-14T21:30:00.000Z",
  },
  {
    id: "vr2",
    visitor_name: "Rafael Lima",
    visitor_phone: null,
    visitor_email: "rafael@exemplo.com",
    message: null,
    created_at: "2026-09-13T12:00:00.000Z",
  },
];

describe("VisitRequestsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lista os pedidos com nome, mensagem e data em horário de Brasília", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: REQUESTS });

    render(<VisitRequestsPanel groupId="g1" />);

    await waitFor(() => expect(screen.getByText("Marina Alves")).toBeInTheDocument());
    expect(api.get).toHaveBeenCalledWith("/small-groups/g1/visit-requests");
    expect(screen.getByText("Posso levar meu filho?")).toBeInTheDocument();
    expect(screen.getByText("Rafael Lima")).toBeInTheDocument();
    // 21:30Z em 14/09 é 18:30 em São Paulo — se o fuso escapar, o teste pega.
    expect(screen.getByText("14/09/2026, 18:30")).toBeInTheDocument();
  });

  it("mostra telefone e e-mail como link de contato, só quando existem", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: REQUESTS });

    render(<VisitRequestsPanel groupId="g1" />);

    await waitFor(() => expect(screen.getByText("Marina Alves")).toBeInTheDocument());

    expect(screen.getByRole("link", { name: /11988887777/ })).toHaveAttribute(
      "href",
      "tel:11988887777",
    );
    expect(screen.getByRole("link", { name: /rafael@exemplo.com/ })).toHaveAttribute(
      "href",
      "mailto:rafael@exemplo.com",
    );
    // Marina não deixou e-mail e Rafael não deixou telefone: dois links no
    // total, não quatro.
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("distingue 'sem acesso' de 'nenhum pedido' quando a API responde 403", async () => {
    vi.mocked(api.get).mockRejectedValue(forbidden());

    render(<VisitRequestsPanel groupId="g1" />);

    await waitFor(() =>
      expect(
        screen.getByText(/Você não tem acesso a os pedidos de visita desta célula/),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Nenhum pedido de visita recebido/)).not.toBeInTheDocument();
  });

  it("mostra o estado vazio quando a célula não recebeu pedido", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });

    render(<VisitRequestsPanel groupId="g1" />);

    await waitFor(() =>
      expect(screen.getByText("Nenhum pedido de visita recebido.")).toBeInTheDocument(),
    );
  });

  it("avisa quando a carga falha por outro motivo", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("boom"));

    render(<VisitRequestsPanel groupId="g1" />);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Não foi possível carregar os pedidos de visita.",
      ),
    );
  });
});
