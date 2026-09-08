// Testes de ContentClient — wrapper fino sobre authenticatedRequest.
// Cada teste confirma o path/query que a task R3-T3 (tasks.md) exige
// (MOB-06, AC2).
const mockAuthenticatedRequest = jest.fn();
jest.mock("../auth/auth-client", () => ({
  authenticatedRequest: (...args: unknown[]) => mockAuthenticatedRequest(...args),
}));

import { getPost, getPosts } from "./content-client";

describe("ContentClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getPosts", () => {
    it("chama GET /content/posts sem query quando nenhum argumento é informado", async () => {
      mockAuthenticatedRequest.mockResolvedValue({ data: [], total: 0 });

      await getPosts();

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith("get", "/content/posts");
    });

    it("monta a query ?page=2&limit=10 quando page e limit são informados", async () => {
      mockAuthenticatedRequest.mockResolvedValue({ data: [], total: 0 });

      await getPosts(2, 10);

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith("get", "/content/posts?page=2&limit=10");
    });

    it("retorna o PostsPage resolvido pelo authenticatedRequest", async () => {
      const page = { data: [{ id: "p1" }], total: 1 };
      mockAuthenticatedRequest.mockResolvedValue(page);

      const result = await getPosts(1, 20);

      expect(result).toEqual(page);
    });
  });

  describe("getPost", () => {
    it("chama GET /content/posts/:id com o id informado", async () => {
      const post = { id: "abc", title: "Título" };
      mockAuthenticatedRequest.mockResolvedValue(post);

      const result = await getPost("abc");

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith("get", "/content/posts/abc");
      expect(result).toEqual(post);
    });
  });
});
