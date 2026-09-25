// book-names: nome do livro a partir do código, com uma busca por sessão e
// o próprio código como reserva quando a lista não chega.
import { act, renderHook, waitFor } from "@testing-library/react-native";

const mockGetBooks = jest.fn();
jest.mock("./bible-client", () => ({
  getBooks: (...args: unknown[]) => mockGetBooks(...args),
}));

import { formatVerseReference, resetBookNamesCache, useBookNames } from "./book-names";

const BOOKS = [{ code: "JHN", name: "João", testament: "NT", chapters: 21 }];

describe("formatVerseReference", () => {
  const names = new Map([["JHN", "João"]]);

  it("capítulo sozinho, versículo único e trecho", () => {
    expect(formatVerseReference(names, "JHN", 3)).toBe("João 3");
    expect(formatVerseReference(names, "JHN", 3, 16)).toBe("João 3:16");
    expect(formatVerseReference(names, "JHN", 3, 16, 16)).toBe("João 3:16");
    expect(formatVerseReference(names, "JHN", 3, 16, 18)).toBe("João 3:16-18");
  });

  it("sem a lista (ou livro desconhecido), usa o código", () => {
    expect(formatVerseReference(null, "JHN", 3, 16)).toBe("JHN 3:16");
    expect(formatVerseReference(names, "XXX", 1)).toBe("XXX 1");
  });
});

describe("useBookNames", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetBookNamesCache();
  });

  it("busca a lista uma vez e reaproveita entre telas", async () => {
    mockGetBooks.mockResolvedValue(BOOKS);

    const first = await renderHook(() => useBookNames());
    await waitFor(() => expect(first.result.current?.get("JHN")).toBe("João"));
    const second = await renderHook(() => useBookNames());
    await waitFor(() => expect(second.result.current?.get("JHN")).toBe("João"));

    expect(mockGetBooks).toHaveBeenCalledTimes(1);
  });

  it("falhou: devolve null e a próxima tela tenta de novo", async () => {
    mockGetBooks.mockRejectedValueOnce(new Error("rede"));
    mockGetBooks.mockResolvedValueOnce(BOOKS);

    const first = await renderHook(() => useBookNames());
    await act(async () => {});
    expect(first.result.current).toBeNull();

    const second = await renderHook(() => useBookNames());
    await waitFor(() => expect(second.result.current?.get("JHN")).toBe("João"));
    expect(mockGetBooks).toHaveBeenCalledTimes(2);
  });

  it("desmontou antes de chegar: não atualiza estado", async () => {
    let resolve: (v: typeof BOOKS) => void = () => {};
    mockGetBooks.mockReturnValue(new Promise((r) => (resolve = r)));

    const hook = await renderHook(() => useBookNames());
    await hook.unmount();
    await act(async () => {
      resolve(BOOKS);
    });

    expect(hook.result.current).toBeNull();
  });
});
