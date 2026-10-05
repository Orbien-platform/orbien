import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { dayRangeBounds, fetchTransactionsInRange, TX_MAX_PAGES } from "./transactions";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

const get = vi.mocked(api.get);

function page(n: number, size: number, total: number) {
  return Promise.resolve({ data: { data: Array.from({ length: size }, (_, i) => ({ id: `${n}-${i}` })), total } });
}

describe("fetchTransactionsInRange", () => {
  beforeEach(() => vi.clearAllMocks());

  it("manda o intervalo e o limite máximo da API", async () => {
    get.mockReturnValueOnce(page(1, 2, 2));
    await fetchTransactionsInRange("2026-10-01T00:00:00.000Z", "2026-10-31T23:59:59.999Z");

    const url = get.mock.calls[0]![0] as string;
    expect(url).toContain("limit=100");
    expect(url).toContain("page=1");
    expect(url).toContain("since=2026-10-01T00%3A00%3A00.000Z");
    expect(url).toContain("until=2026-10-31T23%3A59%3A59.999Z");
  });

  it("junta todas as páginas até o total", async () => {
    get.mockReturnValueOnce(page(1, 100, 230)).mockReturnValueOnce(page(2, 100, 230)).mockReturnValueOnce(page(3, 30, 230));
    const { rows, truncated } = await fetchTransactionsInRange();

    expect(rows).toHaveLength(230);
    expect(truncated).toBe(false);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it("para numa página vazia mesmo que o total prometa mais", async () => {
    get.mockReturnValueOnce(page(1, 100, 500)).mockReturnValueOnce(page(2, 0, 500));
    const { rows } = await fetchTransactionsInRange();
    expect(rows).toHaveLength(100);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("corta no teto de páginas e avisa que truncou", async () => {
    get.mockImplementation(() => page(1, 100, 1_000_000));
    const { rows, truncated } = await fetchTransactionsInRange();
    expect(get).toHaveBeenCalledTimes(TX_MAX_PAGES);
    expect(rows).toHaveLength(100 * TX_MAX_PAGES);
    expect(truncated).toBe(true);
  });

  it("resposta sem `data` vira lista vazia", async () => {
    get.mockResolvedValueOnce({ data: {} });
    const { rows, truncated } = await fetchTransactionsInRange();
    expect(rows).toEqual([]);
    expect(truncated).toBe(false);
  });

  it("propaga o erro da API (403 inclusive) para quem chama decidir", async () => {
    get.mockRejectedValueOnce({ response: { status: 403 } });
    await expect(fetchTransactionsInRange()).rejects.toEqual({ response: { status: 403 } });
  });
});

describe("dayRangeBounds", () => {
  it("abre o primeiro dia à meia-noite UTC e fecha o último no fim do dia", () => {
    expect(dayRangeBounds("2026-10-01", "2026-10-31")).toEqual({
      since: "2026-10-01T00:00:00.000Z",
      until: "2026-10-31T23:59:59.999Z",
    });
  });

  it("deixa sem limite o lado que está vazio", () => {
    expect(dayRangeBounds("", "2026-10-31")).toEqual({ since: undefined, until: "2026-10-31T23:59:59.999Z" });
    expect(dayRangeBounds("2026-10-01", "")).toEqual({ since: "2026-10-01T00:00:00.000Z", until: undefined });
  });
});
