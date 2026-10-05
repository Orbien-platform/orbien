const mockPost = jest.fn();
jest.mock("../api/client", () => ({ apiClient: { post: (...args: unknown[]) => mockPost(...args) } }));

import { createDonation, pixCodeToCopy } from "./contribuir-client";

describe("contribuir-client", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPost.mockResolvedValue({});
  });

  it("envia o slug, o valor e a palavra-chave da categoria, sem token", async () => {
    await createDonation({ tenantSlug: "igreja-teste", amount: 150, category: "missoes" });

    expect(mockPost).toHaveBeenCalledWith("/financial/pix/public-donation", {
      body: { tenant_slug: "igreja-teste", amount: 150, category_slug: "missionária" },
    });
  });

  it("doação anônima não manda nome; identificada manda o nome sem espaços nas pontas", async () => {
    await createDonation({ tenantSlug: "s", amount: 10, category: "dizimo" });
    expect(mockPost.mock.calls[0][1].body).not.toHaveProperty("donor_name");

    await createDonation({ tenantSlug: "s", amount: 10, category: "oferta", donorName: "  Ana  " });
    expect(mockPost.mock.calls[1][1].body.donor_name).toBe("Ana");
  });

  it("nome em branco conta como anônima", async () => {
    await createDonation({ tenantSlug: "s", amount: 10, category: "oferta", donorName: "   " });
    expect(mockPost.mock.calls[0][1].body).not.toHaveProperty("donor_name");
  });

  it("copia o copia-e-cola do QR quando existe, senão a chave", () => {
    const base = { pix_key: "chave", amount: 1, church_name: "I", transaction_ref: "r" };
    expect(pixCodeToCopy({ ...base, mode: "static" })).toBe("chave");
    expect(pixCodeToCopy({ ...base, mode: "dynamic", qr_code: "000201" })).toBe("000201");
    expect(pixCodeToCopy({ ...base, mode: "dynamic" })).toBe("chave");
  });
});
