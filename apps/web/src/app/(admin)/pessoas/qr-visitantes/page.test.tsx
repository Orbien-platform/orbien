import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

  it("sem o endereço da igreja, o botão Mostrar QR fica desabilitado", async () => {
    get.mockImplementation(async (url: string) => {
      if (url === "/admin/visitor/qr") return { data: [QR_SERVICE] };
      throw httpError(500);
    });
    await open();
    await screen.findByText("Culto de domingo");
    expect(screen.getByRole("button", { name: /Mostrar QR/ })).toBeDisabled();
  });
});
