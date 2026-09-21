// Testes de BibleClient — wrapper fino sobre authenticatedRequest.
// Mesmo padrão de content-client.test.ts: cada teste confirma o
// método/path/body que a função monta.
const mockAuthenticatedRequest = jest.fn();
jest.mock("../auth/auth-client", () => ({
  authenticatedRequest: (...args: unknown[]) => mockAuthenticatedRequest(...args),
}));

import { createMark, deleteMark, getBooks, getChapter, getFeed, updateMark } from "./bible-client";

describe("BibleClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getBooks", () => {
    it("chama GET /bible/books e retorna a lista", async () => {
      const books = [{ code: "GEN", name: "Gênesis", testament: "AT", chapters: 50 }];
      mockAuthenticatedRequest.mockResolvedValue(books);

      const result = await getBooks();

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith("get", "/bible/books");
      expect(result).toEqual(books);
    });
  });

  describe("getChapter", () => {
    it("chama GET /bible/books/:bookCode/chapters/:chapter", async () => {
      const chapter = { book_code: "JHN", chapter: 3, verses: [] };
      mockAuthenticatedRequest.mockResolvedValue(chapter);

      const result = await getChapter("JHN", 3);

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
        "get",
        "/bible/books/JHN/chapters/3",
      );
      expect(result).toEqual(chapter);
    });
  });

  describe("createMark", () => {
    it("chama POST /bible/marks com o input como corpo", async () => {
      const input = {
        book_code: "JHN",
        chapter: 3,
        verse_start: 16,
        verse_end: 18,
        comment: "Deus amou o mundo...",
      };
      const mark = { id: "m1", ...input };
      mockAuthenticatedRequest.mockResolvedValue(mark);

      const result = await createMark(input);

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith("post", "/bible/marks", {
        body: input,
      });
      expect(result).toEqual(mark);
    });
  });

  describe("updateMark", () => {
    it("chama PATCH /bible/marks/:id com { comment } como corpo", async () => {
      const mark = { id: "m1", comment: "texto revisado" };
      mockAuthenticatedRequest.mockResolvedValue(mark);

      const result = await updateMark("m1", "texto revisado");

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith("patch", "/bible/marks/m1", {
        body: { comment: "texto revisado" },
      });
      expect(result).toEqual(mark);
    });
  });

  describe("deleteMark", () => {
    it("chama DELETE /bible/marks/:id", async () => {
      mockAuthenticatedRequest.mockResolvedValue({ id: "m1" });

      const result = await deleteMark("m1");

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith("delete", "/bible/marks/m1");
      expect(result).toEqual({ id: "m1" });
    });
  });

  describe("getFeed", () => {
    it("chama GET /bible/feed sem query quando nenhum parâmetro é informado", async () => {
      const page = { items: [], nextCursor: null };
      mockAuthenticatedRequest.mockResolvedValue(page);

      const result = await getFeed();

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith("get", "/bible/feed");
      expect(result).toEqual(page);
    });

    it("monta ?before=... quando before é informado", async () => {
      mockAuthenticatedRequest.mockResolvedValue({ items: [], nextCursor: null });

      await getFeed({ before: "m1" });

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith("get", "/bible/feed?before=m1");
    });

    it("monta ?before=...&limit=... quando os dois são informados", async () => {
      mockAuthenticatedRequest.mockResolvedValue({ items: [], nextCursor: null });

      await getFeed({ before: "m1", limit: 20 });

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
        "get",
        "/bible/feed?before=m1&limit=20",
      );
    });
  });
});
