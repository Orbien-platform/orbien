import { act, renderHook } from "@testing-library/react";
import { AxiosError } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { POLL_INTERVAL_MS, POLL_MAX_BACKOFF_MS, usePaymentStatus } from "./usePaymentStatus";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

const get = vi.mocked(api.get);
const ID = "8c9f9a52-3b2e-4a40-9d63-6c6a2f0a1b11";
const URL = `/financial/pix/public-donation/igreja-x/${ID}`;

function httpError(status: number) {
  return new AxiosError("falhou", "ERR_BAD_RESPONSE", undefined, undefined, {
    status,
    data: {},
    statusText: "",
    headers: {},
    config: {} as never,
  });
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
  get.mockReset();
  setVisibility("visible");
});

afterEach(() => {
  vi.useRealTimers();
});

const FUTURE = "2026-10-04T12:00:00Z";

describe("usePaymentStatus", () => {
  it("sem payment_id (doação estática) não consulta nada e fica pending", async () => {
    const { result } = renderHook(() => usePaymentStatus("igreja-x", null, null));

    await tick(60_000);

    expect(get).not.toHaveBeenCalled();
    expect(result.current).toBe("pending");
  });

  it("consulta a cada 4s enquanto pending, na URL com slug e id", async () => {
    get.mockResolvedValue({ data: { status: "pending" } });
    const { result } = renderHook(() => usePaymentStatus("igreja-x", ID, FUTURE));

    await tick(POLL_INTERVAL_MS - 1);
    expect(get).not.toHaveBeenCalled();
    await tick(1);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(URL);
    await tick(POLL_INTERVAL_MS);
    expect(get).toHaveBeenCalledTimes(2);
    expect(result.current).toBe("pending");
  });

  it("ao receber `confirmed`, para: nenhuma consulta depois", async () => {
    get.mockResolvedValueOnce({ data: { status: "pending" } });
    get.mockResolvedValueOnce({ data: { status: "confirmed" } });
    const { result } = renderHook(() => usePaymentStatus("igreja-x", ID, FUTURE));

    await tick(POLL_INTERVAL_MS * 2);
    expect(result.current).toBe("confirmed");
    const chamadas = get.mock.calls.length;

    await tick(60_000);
    expect(get).toHaveBeenCalledTimes(chamadas);
  });

  it("o `expired` do servidor também encerra", async () => {
    get.mockResolvedValue({ data: { status: "expired" } });
    const { result } = renderHook(() => usePaymentStatus("igreja-x", ID, FUTURE));

    await tick(POLL_INTERVAL_MS);

    expect(result.current).toBe("expired");
    await tick(60_000);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("404 encerra como `expired` — a doação não existe mais para esta igreja", async () => {
    get.mockRejectedValue(httpError(404));
    const { result } = renderHook(() => usePaymentStatus("igreja-x", ID, FUTURE));

    await tick(POLL_INTERVAL_MS);

    expect(result.current).toBe("expired");
    await tick(60_000);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("429, 5xx e rede caída recuam 4 → 8 → 16 → 16s, sem encerrar", async () => {
    get.mockRejectedValue(httpError(429));
    const { result } = renderHook(() => usePaymentStatus("igreja-x", ID, FUTURE));

    await tick(4_000); // 1ª falha → próxima em 8s
    expect(get).toHaveBeenCalledTimes(1);
    await tick(7_999);
    expect(get).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(get).toHaveBeenCalledTimes(2); // → próxima em 16s
    await tick(15_999);
    expect(get).toHaveBeenCalledTimes(2);
    await tick(1);
    expect(get).toHaveBeenCalledTimes(3); // teto: segue em 16s
    await tick(POLL_MAX_BACKOFF_MS);
    expect(get).toHaveBeenCalledTimes(4);
    expect(result.current).toBe("pending");
  });

  it("erro sem resposta (rede) também recua, e o sucesso seguinte volta aos 4s", async () => {
    get.mockRejectedValueOnce(new Error("Network Error"));
    get.mockResolvedValue({ data: { status: "pending" } });
    renderHook(() => usePaymentStatus("igreja-x", ID, FUTURE));

    await tick(4_000); // falha → 8s
    await tick(8_000); // sucesso → volta a 4s
    expect(get).toHaveBeenCalledTimes(2);
    await tick(4_000);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it("passou da validade: `expired` sem consultar o servidor", async () => {
    const { result } = renderHook(() =>
      usePaymentStatus("igreja-x", ID, "2026-10-03T12:00:02Z"),
    );

    await tick(POLL_INTERVAL_MS);

    expect(result.current).toBe("expired");
    expect(get).not.toHaveBeenCalled();
  });

  it("sem validade informada, consulta normalmente", async () => {
    get.mockResolvedValue({ data: { status: "confirmed" } });
    const { result } = renderHook(() => usePaymentStatus("igreja-x", ID, null));

    await tick(POLL_INTERVAL_MS);

    expect(result.current).toBe("confirmed");
  });

  it("aba oculta não gasta requisição; ao voltar a ficar visível, consulta na hora", async () => {
    get.mockResolvedValue({ data: { status: "confirmed" } });
    const { result } = renderHook(() => usePaymentStatus("igreja-x", ID, FUTURE));

    setVisibility("hidden");
    await tick(POLL_INTERVAL_MS * 3);
    expect(get).not.toHaveBeenCalled();

    setVisibility("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(get).toHaveBeenCalledTimes(1);
    expect(result.current).toBe("confirmed");
  });

  it("mudar a visibilidade para oculta não dispara consulta", async () => {
    renderHook(() => usePaymentStatus("igreja-x", ID, FUTURE));

    setVisibility("hidden");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(get).not.toHaveBeenCalled();
  });

  it("depois de um estado final, voltar à aba não consulta de novo", async () => {
    get.mockResolvedValue({ data: { status: "confirmed" } });
    renderHook(() => usePaymentStatus("igreja-x", ID, FUTURE));
    await tick(POLL_INTERVAL_MS);
    expect(get).toHaveBeenCalledTimes(1);

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(get).toHaveBeenCalledTimes(1);
  });

  it("voltar à aba com uma consulta já em andamento não duplica a requisição", async () => {
    let resolver!: (v: unknown) => void;
    get.mockReturnValue(new Promise((r) => (resolver = r)) as never);
    renderHook(() => usePaymentStatus("igreja-x", ID, FUTURE));

    await tick(POLL_INTERVAL_MS); // consulta em andamento
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(get).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolver({ data: { status: "pending" } });
    });
  });

  it("desmontar cancela o próximo agendamento e remove o ouvinte de visibilidade", async () => {
    get.mockResolvedValue({ data: { status: "pending" } });
    const { unmount } = renderHook(() => usePaymentStatus("igreja-x", ID, FUTURE));
    await tick(POLL_INTERVAL_MS);
    expect(get).toHaveBeenCalledTimes(1);

    unmount();
    await tick(60_000);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(get).toHaveBeenCalledTimes(1);
  });

  it("resposta que chega depois de desmontar é ignorada (sucesso)", async () => {
    let resolver!: (v: unknown) => void;
    get.mockReturnValue(new Promise((r) => (resolver = r)) as never);
    const { result, unmount } = renderHook(() => usePaymentStatus("igreja-x", ID, FUTURE));
    await tick(POLL_INTERVAL_MS);

    unmount();
    await act(async () => {
      resolver({ data: { status: "confirmed" } });
    });
    await tick(60_000);

    expect(result.current).toBe("pending");
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("erro que chega depois de desmontar é ignorado", async () => {
    let rejeitar!: (e: unknown) => void;
    get.mockReturnValue(new Promise((_, rej) => (rejeitar = rej)) as never);
    const { unmount } = renderHook(() => usePaymentStatus("igreja-x", ID, FUTURE));
    await tick(POLL_INTERVAL_MS);

    unmount();
    await act(async () => {
      rejeitar(httpError(404));
    });
    await tick(60_000);

    expect(get).toHaveBeenCalledTimes(1);
  });

  it("outra doação começa de novo em pending — o estado da anterior não vaza", async () => {
    get.mockResolvedValue({ data: { status: "confirmed" } });
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => usePaymentStatus("igreja-x", id, FUTURE),
      { initialProps: { id: ID as string | null } },
    );
    await tick(POLL_INTERVAL_MS);
    expect(result.current).toBe("confirmed");

    rerender({ id: "11111111-1111-4111-8111-111111111111" });

    expect(result.current).toBe("pending");
  });
});
