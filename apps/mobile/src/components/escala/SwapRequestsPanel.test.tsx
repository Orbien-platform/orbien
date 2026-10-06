import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockRespondToSwap = jest.fn();
jest.mock("../../lib/escala/escala-client", () => ({
  respondToSwap: (...args: unknown[]) => mockRespondToSwap(...args),
}));

import { HttpError } from "../../lib/api/errors";
import type { SwapRequest } from "../../lib/escala/types";
import { describeSlot, SwapRequestsPanel } from "./SwapRequestsPanel";

const BASE: SwapRequest = {
  id: "r1",
  status: "pending",
  message: null,
  created_at: "2026-09-01T12:00:00.000Z",
  responded_at: null,
  assignment: {
    id: "a1",
    scheduled_date: "2026-09-13T00:00:00.000Z",
    celebration: { name: "Culto", start_time: "09:30" },
    ministry: { id: "m1", name: "Mídia" },
  },
  requester: { volunteer_profile_id: "vp-ana", full_name: "Ana Souza" },
  target: null,
  accepted_by: null,
};
const ME = { volunteer_profile_id: "vp-me", full_name: "Caio Freitas" };
const BIA = { volunteer_profile_id: "vp-bia", full_name: "Bianca Lopes" };

describe("describeSlot", () => {
  it("junta ministério e dia do culto; sem data, só o ministério", () => {
    expect(describeSlot(BASE)).toBe("Mídia · dom, 13 set · 09:30");
    expect(describeSlot({ ...BASE, assignment: { ...BASE.assignment, scheduled_date: "x" } })).toBe(
      "Mídia",
    );
  });
});

describe("SwapRequestsPanel", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sem pedidos, mostra os dois vazios com a direção do que fazer", async () => {
    await render(<SwapRequestsPanel swaps={{ incoming: [], outgoing: [] }} onChanged={jest.fn()} />);

    expect(screen.getByText("Nenhum pedido esperando sua resposta.")).toBeTruthy();
    expect(screen.getByTestId("trocas-enviadas-vazio")).toBeTruthy();
  });

  it("recebido aberto ao ministério: só Aceitar, com a mensagem de quem pediu", async () => {
    await render(
      <SwapRequestsPanel
        swaps={{ incoming: [{ ...BASE, message: "Viagem em família" }], outgoing: [] }}
        onChanged={jest.fn()}
      />,
    );

    expect(screen.getByText("Ana pediu para trocar")).toBeTruthy();
    expect(screen.getByText("Aberto a todo o ministério")).toBeTruthy();
    expect(screen.getByText("“Viagem em família”")).toBeTruthy();
    expect(screen.getByTestId("troca-aceitar-r1")).toBeTruthy();
    expect(screen.queryByTestId("troca-recusar-r1")).toBeNull();
  });

  it("recebido dirigido a mim: recusar chama a API e recarrega", async () => {
    const onChanged = jest.fn();
    mockRespondToSwap.mockResolvedValue({});
    await render(
      <SwapRequestsPanel swaps={{ incoming: [{ ...BASE, target: ME }], outgoing: [] }} onChanged={onChanged} />,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId("troca-recusar-r1"));
    });

    expect(mockRespondToSwap).toHaveBeenCalledWith("r1", "decline");
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("duplo toque dispara uma chamada só", async () => {
    let resolve!: (value: unknown) => void;
    mockRespondToSwap.mockReturnValue(new Promise((r) => (resolve = r)));
    await render(
      <SwapRequestsPanel swaps={{ incoming: [{ ...BASE, target: ME }], outgoing: [] }} onChanged={jest.fn()} />,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId("troca-aceitar-r1"));
      fireEvent.press(screen.getByTestId("troca-recusar-r1"));
    });
    await act(async () => resolve({}));

    expect(mockRespondToSwap).toHaveBeenCalledTimes(1);
  });

  it.each([
    [new HttpError(409, "conflito"), "Este pedido não está mais em aberto.", 1],
    [
      new HttpError(403, "proibido"),
      "Você não pode assumir esta escala: não serve no ministério ou já está nela.",
      0,
    ],
    [new Error("rede"), "Não foi possível concluir a ação. Tente novamente.", 0],
  ])("falha ao aceitar (%s) diz o que houve", async (err, message, reloads) => {
    const onChanged = jest.fn();
    mockRespondToSwap.mockRejectedValue(err);
    await render(<SwapRequestsPanel swaps={{ incoming: [BASE], outgoing: [] }} onChanged={onChanged} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId("troca-aceitar-r1"));
    });

    expect(screen.getByText(message)).toBeTruthy();
    expect(onChanged).toHaveBeenCalledTimes(reloads);
  });

  it("403 ao cancelar não fala em assumir escala", async () => {
    mockRespondToSwap.mockRejectedValue(new HttpError(403, "proibido"));
    await render(
      <SwapRequestsPanel swaps={{ incoming: [], outgoing: [{ ...BASE, requester: ME }] }} onChanged={jest.fn()} />,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId("troca-cancelar-r1"));
    });

    expect(mockRespondToSwap).toHaveBeenCalledWith("r1", "cancel");
    expect(screen.getByText("Não foi possível concluir a ação. Tente novamente.")).toBeTruthy();
  });

  it("enviados dizem em que pé está cada pedido", async () => {
    const outgoing: SwapRequest[] = [
      { ...BASE, id: "p1", requester: ME },
      { ...BASE, id: "p2", requester: ME, target: BIA },
      { ...BASE, id: "p3", requester: ME, status: "accepted", accepted_by: BIA },
      { ...BASE, id: "p4", requester: ME, status: "accepted" },
      { ...BASE, id: "p5", requester: ME, status: "declined", target: BIA },
      { ...BASE, id: "p6", requester: ME, status: "declined" },
      { ...BASE, id: "p7", requester: ME, status: "cancelled" },
    ];
    await render(<SwapRequestsPanel swaps={{ incoming: [], outgoing }} onChanged={jest.fn()} />);

    expect(screen.getByText("Aberto a todo o ministério")).toBeTruthy();
    expect(screen.getByText("Aguardando Bianca Lopes")).toBeTruthy();
    expect(screen.getByText("Bianca Lopes assumiu")).toBeTruthy();
    expect(screen.getByText("Um colega assumiu")).toBeTruthy();
    expect(screen.getByText("Bianca Lopes não pode")).toBeTruthy();
    expect(screen.getByText("O colega não pode")).toBeTruthy();
    expect(screen.getByText("Você cancelou")).toBeTruthy();
    expect(screen.getByTestId("troca-cancelar-p1")).toBeTruthy();
    expect(screen.queryByTestId("troca-cancelar-p3")).toBeNull();
  });
});
