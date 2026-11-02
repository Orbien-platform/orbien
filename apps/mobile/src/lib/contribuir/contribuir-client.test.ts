const mockPost = jest.fn();
const mockGet = jest.fn();
jest.mock("../api/client", () => ({
  apiClient: {
    post: (...args: unknown[]) => mockPost(...args),
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

import {
  createDonation,
  fetchDonationCategories,
  invalidateDonationCategories,
  pixCodeToCopy,
} from "./contribuir-client";

describe("contribuir-client", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPost.mockResolvedValue({});
  });

  it("envia o slug, o valor e o id da categoria, sem token e sem palavra-chave", async () => {
    await createDonation({ tenantSlug: "igreja-teste", amount: 150, categoryId: "cat-1" });

    expect(mockPost).toHaveBeenCalledWith("/financial/pix/public-donation", {
      body: { tenant_slug: "igreja-teste", amount: 150, category_id: "cat-1" },
    });
  });

  it("igreja sem categorias: não manda category_id", async () => {
    await createDonation({ tenantSlug: "s", amount: 10 });
    expect(mockPost.mock.calls[0][1].body).not.toHaveProperty("category_id");
  });

  describe("fetchDonationCategories", () => {
    const LIST = [{ id: "c1", name: "Dízimo", description: null }];

    it("busca a lista da igreja pelo slug e guarda para a próxima abertura", async () => {
      mockGet.mockResolvedValue(LIST);

      await expect(fetchDonationCategories("igreja-a")).resolves.toEqual(LIST);
      await fetchDonationCategories("igreja-a");

      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(mockGet).toHaveBeenCalledWith("/financial/pix/public-categories/igreja-a");
      invalidateDonationCategories("igreja-a");
    });

    it("cada igreja tem a sua lista", async () => {
      mockGet.mockResolvedValue(LIST);
      await fetchDonationCategories("igreja-b");
      await fetchDonationCategories("igreja-c");

      expect(mockGet).toHaveBeenCalledTimes(2);
      invalidateDonationCategories("igreja-b");
      invalidateDonationCategories("igreja-c");
    });

    it("erro não é guardado: a próxima chamada tenta de novo", async () => {
      mockGet.mockRejectedValueOnce(new Error("rede")).mockResolvedValueOnce(LIST);

      await expect(fetchDonationCategories("igreja-d")).rejects.toThrow("rede");
      await expect(fetchDonationCategories("igreja-d")).resolves.toEqual(LIST);
      invalidateDonationCategories("igreja-d");
    });

    it("invalidar descarta a lista guardada", async () => {
      mockGet.mockResolvedValue(LIST);
      await fetchDonationCategories("igreja-e");
      invalidateDonationCategories("igreja-e");
      await fetchDonationCategories("igreja-e");

      expect(mockGet).toHaveBeenCalledTimes(2);
      invalidateDonationCategories("igreja-e");
    });
  });

  it("doação anônima não manda nome; identificada manda o nome sem espaços nas pontas", async () => {
    await createDonation({ tenantSlug: "s", amount: 10, categoryId: "c1" });
    expect(mockPost.mock.calls[0][1].body).not.toHaveProperty("donor_name");

    await createDonation({ tenantSlug: "s", amount: 10, categoryId: "c1", donorName: "  Ana  " });
    expect(mockPost.mock.calls[1][1].body.donor_name).toBe("Ana");
  });

  it("nome em branco conta como anônima", async () => {
    await createDonation({ tenantSlug: "s", amount: 10, categoryId: "c1", donorName: "   " });
    expect(mockPost.mock.calls[0][1].body).not.toHaveProperty("donor_name");
  });

  it("copia o copia-e-cola do QR quando existe, senão a chave", () => {
    const base = { pix_key: "chave", amount: 1, church_name: "I", transaction_ref: "r" };
    expect(pixCodeToCopy({ ...base, mode: "static" })).toBe("chave");
    expect(pixCodeToCopy({ ...base, mode: "dynamic", qr_code: "000201" })).toBe("000201");
    expect(pixCodeToCopy({ ...base, mode: "dynamic" })).toBe("chave");
  });
});
