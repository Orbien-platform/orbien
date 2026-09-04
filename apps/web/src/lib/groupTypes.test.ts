import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn() },
}));

import api from "@/lib/api";
import { fetchGroupTypes } from "./groupTypes";

describe("fetchGroupTypes", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it("busca sem parâmetros por padrão e retorna a lista", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [{ id: "1", name: "Célula", color: null, is_active: true }] });

    const result = await fetchGroupTypes();

    expect(api.get).toHaveBeenCalledWith("/groups/types", { params: undefined });
    expect(result).toEqual([{ id: "1", name: "Célula", color: null, is_active: true }]);
  });

  it("inclui inativos quando pedido", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });

    await fetchGroupTypes(true);

    expect(api.get).toHaveBeenCalledWith("/groups/types", { params: { include_inactive: true } });
  });

  it("retorna lista vazia quando a API não devolve corpo", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: undefined });

    expect(await fetchGroupTypes()).toEqual([]);
  });
});
