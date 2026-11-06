import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QrVisitantesPage from "./page";
import api from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } };
});

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);
const patch = vi.mocked(api.patch);

function httpError(status: number) {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError("erro", String(status), config, null, {
    status,
    statusText: "",
    headers: {},
    config,
    data: {},
  });
}

const QR_SERVICE = {
  id: "qr1",
  token: "tok-culto",
  origin: "service",
  small_group_id: null,
  label: "Culto de domingo",
  is_active: true,
  scan_count: 7,
};
const QR_GROUP = {
  id: "qr2",
  token: "tok-grupo",
  origin: "small_group",
  small_group_id: "g1",
  label: null,
  is_active: false,
  scan_count: 0,
};

function serve(list: unknown = [QR_SERVICE, QR_GROUP]) {
  get.mockImplementation(async (url: string) => {
    if (url === "/admin/visitor/qr") {
      if (list instanceof Error) throw list;
      return { data: list };
    }
    if (url === "/settings") return { data: { tenant: { slug: "teste2-church" } } };
    if (url === "/small-groups") return { data: { data: [{ id: "g1", name: "Célula Centro" }] } };
    throw new Error(`rota inesperada ${url}`);
  });
}

async function open() {
  await act(async () => {
    render(<QrVisitantesPage />);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  serve();
  patch.mockResolvedValue({ data: {} });
  post.mockResolvedValue({ data: {} });
});

describe("QrVisitantesPage (PEND-19)", () => {
  it("lista os QR com nome, origem, cadastros e situação", async () => {
    await open();
    expect(await screen.findByText("Culto de domingo")).toBeInTheDocument();
    // Sem rótulo, mostra o nome do grupo.
    expect(screen.getByText("Célula Centro")).toBeInTheDocument();
    expect(screen.getByText("Ativo")).toBeInTheDocument();
    expect(screen.getByText("Desativado")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("sem QR, convida a criar o do culto", async () => {
    serve([]);
    await open();
    expect(await screen.findByText("Nenhum QR criado ainda")).toBeInTheDocument();
  });

  it("403 mostra sem acesso, não lista vazia", async () => {
    serve(httpError(403));
    await open();
    expect(await screen.findByText(/Você não tem acesso a QR de visitantes/)).toBeInTheDocument();
    expect(screen.queryByText("Nenhum QR criado ainda")).not.toBeInTheDocument();
  });

  it("falha de carga mostra o erro com nova tentativa", async () => {
    serve(httpError(500));
    await open();
    expect(await screen.findByText("Não foi possível carregar os QR.")).toBeInTheDocument();
  });

  it("cria QR de grupo exigindo o grupo", async () => {
    await open();
    await screen.findByText("Culto de domingo");
    fireEvent.click(screen.getByRole("button", { name: /Novo QR/ }));

    fireEvent.change(await screen.findByLabelText("Onde ele vai ficar"), {
      target: { value: "small_group" },
    });
    const submit = screen.getByRole("button", { name: "Criar QR" });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Grupo"), { target: { value: "g1" } });
    fireEvent.change(screen.getByLabelText("Nome (opcional)"), { target: { value: " Quarta à noite " } });
    expect(submit).toBeEnabled();
    await act(async () => {
      fireEvent.click(submit);
    });

    expect(post).toHaveBeenCalledWith("/admin/visitor/qr", {
      origin: "small_group",
      small_group_id: "g1",
      label: "Quarta à noite",
    });
  });

  it("cria QR de evento sem grupo e sem nome", async () => {
    await open();
    await screen.findByText("Culto de domingo");
    fireEvent.click(screen.getByRole("button", { name: /Novo QR/ }));
    fireEvent.change(await screen.findByLabelText("Onde ele vai ficar"), { target: { value: "event" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Criar QR" }));
    });
    expect(post).toHaveBeenCalledWith("/admin/visitor/qr", { origin: "event" });
  });

  it("mostra o erro quando a criação falha", async () => {
    post.mockRejectedValue(httpError(500));
    await open();
    await screen.findByText("Culto de domingo");
    fireEvent.click(screen.getByRole("button", { name: /Novo QR/ }));
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Criar QR" }));
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(/Não foi possível criar o QR|erro/i);
  });

  it("renomeia pelo PATCH com o nome sem espaços nas pontas", async () => {
    await open();
    await screen.findByText("Culto de domingo");
    fireEvent.click(screen.getByRole("button", { name: "Renomear Culto de domingo" }));
    const input = await screen.findByLabelText("Nome");
    fireEvent.change(input, { target: { value: "  Culto das 10h " } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Salvar nome" }));
    });
    expect(patch).toHaveBeenCalledWith("/admin/visitor/qr/qr1", { label: "Culto das 10h" });
  });

  it("desativa e reativa pelo PATCH is_active", async () => {
    await open();
    await screen.findByText("Culto de domingo");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Desativar Culto de domingo" }));
    });
    expect(patch).toHaveBeenCalledWith("/admin/visitor/qr/qr1", { is_active: false });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reativar Célula Centro" }));
    });
    expect(patch).toHaveBeenCalledWith("/admin/visitor/qr/qr2", { is_active: true });
  });

  it("falha ao desativar avisa e não esconde a linha", async () => {
    patch.mockRejectedValue(httpError(500));
    await open();
    await screen.findByText("Culto de domingo");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Desativar Culto de domingo" }));
    });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Culto de domingo")).toBeInTheDocument();
  });

  it("mostra o QR com o endereço do cadastro e copia", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await open();
    await screen.findByText("Culto de domingo");
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Mostrar QR/ })[0]).toBeEnabled());
    fireEvent.click(screen.getAllByRole("button", { name: /Mostrar QR/ })[0]);

    const expected = `${window.location.origin}/visitante/teste2-church/tok-culto`;
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(expected)).toBeInTheDocument();
    expect(within(dialog).getByRole("img", { name: /QR de cadastro: Culto de domingo/ })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: /Copiar endereço/ }));
    });
    expect(writeText).toHaveBeenCalledWith(expected);
    expect(await within(dialog).findByText("Endereço copiado")).toBeInTheDocument();
  });

  it("imprime numa janela só com nome, QR e endereço; avisa se o navegador bloqueia", async () => {
    const win = {
      document: document.implementation.createHTMLDocument(""),
      focus: vi.fn(),
      print: vi.fn(),
    };
    const winOpen = vi.spyOn(window, "open").mockReturnValueOnce(win as unknown as Window);
    await open();
    await screen.findByText("Culto de domingo");
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Mostrar QR/ })[0]).toBeEnabled());
    fireEvent.click(screen.getAllByRole("button", { name: /Mostrar QR/ })[0]);
    const dialog = await screen.findByRole("dialog");

    fireEvent.click(within(dialog).getByRole("button", { name: /Imprimir/ }));
    expect(win.print).toHaveBeenCalled();
    expect(win.document.querySelector("h1")?.textContent).toBe("Culto de domingo");
    expect(win.document.querySelector("svg")).not.toBeNull();
    expect(win.document.querySelector("p")?.textContent).toBe(
      `${window.location.origin}/visitante/teste2-church/tok-culto`,
    );

    winOpen.mockReturnValueOnce(null);
    fireEvent.click(within(dialog).getByRole("button", { name: /Imprimir/ }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/bloqueou/);
    winOpen.mockRestore();
  });

  it("sem o endereço da igreja, o botão Mostrar QR fica desabilitado", async () => {
    get.mockImplementation(async (url: string) => {
      if (url === "/admin/visitor/qr") return { data: [QR_SERVICE] };
      throw httpError(500);
    });
    await open();
    await screen.findByText("Culto de domingo");
    expect(screen.getByRole("button", { name: /Mostrar QR/ })).toBeDisabled();
  });

  it("depois de criar, fecha o formulário e relê a lista", async () => {
    await open();
    await screen.findByText("Culto de domingo");
    const antes = get.mock.calls.filter(([u]) => u === "/admin/visitor/qr").length;
    fireEvent.click(screen.getByRole("button", { name: /Novo QR/ }));
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Criar QR" }));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(get.mock.calls.filter(([u]) => u === "/admin/visitor/qr").length).toBe(antes + 1);
  });

  it("formulário de grupo sem grupo escolhido não envia nem pelo submit direto", async () => {
    await open();
    await screen.findByText("Culto de domingo");
    fireEvent.click(screen.getByRole("button", { name: /Novo QR/ }));
    fireEvent.change(await screen.findByLabelText("Onde ele vai ficar"), {
      target: { value: "small_group" },
    });
    fireEvent.submit(screen.getByLabelText("Grupo").closest("form")!);
    expect(post).not.toHaveBeenCalled();
  });

  it("depois de renomear, fecha o modal e relê a lista", async () => {
    await open();
    await screen.findByText("Culto de domingo");
    fireEvent.click(screen.getByRole("button", { name: "Renomear Célula Centro" }));
    // QR sem nome começa com o campo vazio.
    expect(await screen.findByLabelText("Nome")).toHaveValue("");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Salvar nome" }));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("falha ao renomear mostra o erro e mantém o modal", async () => {
    patch.mockRejectedValue(httpError(500));
    await open();
    await screen.findByText("Culto de domingo");
    fireEvent.click(screen.getByRole("button", { name: "Renomear Culto de domingo" }));
    await screen.findByLabelText("Nome");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Salvar nome" }));
    });
    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
  });

  it("fecha os modais de renomear e de mostrar pelo X", async () => {
    await open();
    await screen.findByText("Culto de domingo");
    fireEvent.click(screen.getByRole("button", { name: "Renomear Culto de domingo" }));
    fireEvent.click(await screen.findByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await waitFor(() => expect(screen.getAllByRole("button", { name: /Mostrar QR/ })[0]).toBeEnabled());
    fireEvent.click(screen.getAllByRole("button", { name: /Mostrar QR/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("QR desativado avisa no modal que não recebe cadastros", async () => {
    await open();
    await screen.findByText("Culto de domingo");
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Mostrar QR/ })[1]).toBeEnabled());
    fireEvent.click(screen.getAllByRole("button", { name: /Mostrar QR/ })[1]);
    expect(await screen.findByText("Este QR está desativado e não recebe cadastros.")).toBeInTheDocument();
  });

  it("copiar falhando orienta a copiar à mão", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("negado")) },
      configurable: true,
    });
    await open();
    await screen.findByText("Culto de domingo");
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Mostrar QR/ })[0]).toBeEnabled());
    fireEvent.click(screen.getAllByRole("button", { name: /Mostrar QR/ })[0]);
    const dialog = await screen.findByRole("dialog");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: /Copiar endereço/ }));
    });
    expect(await within(dialog).findByText(/copie à mão/)).toBeInTheDocument();
  });

  it("grupo que não veio da API cai no nome da origem; resposta fora do formato vira lista vazia", async () => {
    get.mockImplementation(async (url: string) => {
      if (url === "/admin/visitor/qr") return { data: [{ ...QR_GROUP, small_group_id: "g-sumiu" }] };
      if (url === "/settings") return { data: { tenant: { slug: "teste2-church" } } };
      if (url === "/small-groups") return { data: { data: "quebrado" } };
      throw new Error("inesperada");
    });
    await open();
    expect((await screen.findAllByText("Grupo")).length).toBeGreaterThan(0);

    serve({ erro: true });
    cleanup();
    await open();
    expect(await screen.findByText("Nenhum QR criado ainda")).toBeInTheDocument();
  });

  it("sem lista de grupos (falha), a tela segue e o formulário de grupo fica sem opções", async () => {
    get.mockImplementation(async (url: string) => {
      if (url === "/admin/visitor/qr") return { data: [QR_SERVICE] };
      if (url === "/settings") return { data: { tenant: { slug: "teste2-church" } } };
      throw httpError(500);
    });
    await open();
    expect(await screen.findByText("Culto de domingo")).toBeInTheDocument();
  });

  it("resposta que chega depois de a tela sair é ignorada (sucesso e falha)", async () => {
    let resolver: (v: unknown) => void = () => undefined;
    get.mockImplementation((url: string) =>
      url === "/admin/visitor/qr"
        ? new Promise((resolve) => {
            resolver = resolve;
          })
        : Promise.resolve({ data: url === "/settings" ? { tenant: { slug: "x" } } : { data: [] } }),
    );
    const { unmount } = render(<QrVisitantesPage />);
    unmount();
    await act(async () => resolver({ data: [QR_SERVICE] }));

    let rejeitar: (e: unknown) => void = () => undefined;
    get.mockImplementation((url: string) =>
      url === "/admin/visitor/qr"
        ? new Promise((_, reject) => {
            rejeitar = reject;
          })
        : Promise.resolve({ data: url === "/settings" ? { tenant: { slug: "x" } } : { data: [] } }),
    );
    const second = render(<QrVisitantesPage />);
    second.unmount();
    await act(async () => rejeitar(httpError(500)));
  });

  it("toque duplo em Salvar nome envia uma vez só", async () => {
    let liberar: (v: unknown) => void = () => undefined;
    patch.mockImplementation(
      () =>
        new Promise((resolve) => {
          liberar = resolve;
        }),
    );
    await open();
    await screen.findByText("Culto de domingo");
    fireEvent.click(screen.getByRole("button", { name: "Renomear Culto de domingo" }));
    const form = (await screen.findByLabelText("Nome")).closest("form")!;
    await act(async () => {
      fireEvent.submit(form);
    });
    await act(async () => {
      fireEvent.submit(form);
    });
    expect(patch).toHaveBeenCalledTimes(1);
    await act(async () => liberar({ data: {} }));
  });
});
