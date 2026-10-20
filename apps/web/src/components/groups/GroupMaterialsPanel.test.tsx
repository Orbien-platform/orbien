import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AxiosError } from "axios";
import { GroupMaterialsPanel } from "./GroupMaterialsPanel";
import api from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const axios = await import("axios");
  return {
    default: { get: vi.fn() },
    isForbidden: (error: unknown) =>
      axios.default.isAxiosError(error) && error.response?.status === 403,
  };
});

function forbidden() {
  const err = new AxiosError("Forbidden");
  err.response = {
    status: 403,
    data: {},
    statusText: "Forbidden",
    headers: {},
    config: { headers: {} as never },
  };
  return err;
}

const past = "2026-01-10T12:00:00.000Z";
const future = "2999-01-10T12:00:00.000Z";

const MATERIALS = [
  {
    id: "m1",
    title: "Roteiro do PG",
    source_type: "pdf",
    file_url: "https://cdn/roteiro.pdf",
    rich_content: null,
    visibility: "all",
    publish_at: past,
  },
  {
    id: "m2",
    title: "Guia dos líderes",
    source_type: "doc",
    file_url: "https://signed/guia.docx",
    rich_content: null,
    visibility: "leaders_only",
    publish_at: future,
  },
  {
    id: "m3",
    title: "Leitura da semana",
    source_type: "rich_text",
    file_url: null,
    rich_content: "https://exemplo.com/leitura",
    visibility: "all",
    publish_at: past,
  },
  {
    id: "m4",
    title: "Reflexão",
    source_type: "rich_text",
    file_url: null,
    rich_content: "Leia Rute 1 e responda em casa.",
    visibility: "all",
    publish_at: past,
  },
];

describe("GroupMaterialsPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lista os materiais do PG com link, rótulo de agendado e de só líderes", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: MATERIALS });

    render(<GroupMaterialsPanel groupId="g1" />);

    expect(await screen.findByText("Roteiro do PG")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/small-groups/g1/materials");
    expect(screen.getByRole("link", { name: /Abrir Roteiro do PG/ })).toHaveAttribute(
      "href",
      "https://cdn/roteiro.pdf"
    );
    // Arquivo só-líderes chega assinado da API e é aberto como veio.
    expect(screen.getByRole("link", { name: /Abrir Guia dos líderes/ })).toHaveAttribute(
      "href",
      "https://signed/guia.docx"
    );
    expect(screen.getByText("Somente líderes")).toBeInTheDocument();
    expect(screen.getByText(/^Libera em/)).toBeInTheDocument();
    expect(screen.getAllByText(/^Liberado em/)).toHaveLength(3);
    // Texto que é URL vira link; texto comum aparece na própria lista.
    expect(screen.getByRole("link", { name: /Abrir Leitura da semana/ })).toHaveAttribute(
      "href",
      "https://exemplo.com/leitura"
    );
    expect(screen.getByText("Leia Rute 1 e responda em casa.")).toBeInTheDocument();
  });

  it("não vira link para rich_content que não é http(s)", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [{ ...MATERIALS[3], rich_content: "javascript:alert(1)" }],
    });

    render(<GroupMaterialsPanel groupId="g1" />);

    expect(await screen.findByText("javascript:alert(1)")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("material sem arquivo nem texto mostra só o título e a liberação", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [{ ...MATERIALS[3], rich_content: null }],
    });

    render(<GroupMaterialsPanel groupId="g1" />);

    expect(await screen.findByText("Reflexão")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("estado vazio explica de onde os materiais vêm", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });

    render(<GroupMaterialsPanel groupId="g1" />);

    expect(await screen.findByText("Nenhum material para este grupo.")).toBeInTheDocument();
  });

  it("403 mostra estado de sem acesso, não 'nenhum material'", async () => {
    vi.mocked(api.get).mockRejectedValue(forbidden());

    render(<GroupMaterialsPanel groupId="g1" />);

    expect(await screen.findByText(/os materiais deste grupo/)).toBeInTheDocument();
    expect(screen.queryByText("Nenhum material para este grupo.")).not.toBeInTheDocument();
  });

  it("falha que não é 403 mostra o erro", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("boom"));

    render(<GroupMaterialsPanel groupId="g1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar os materiais.");
  });

  it("sair antes da resposta não atualiza o estado", async () => {
    let resolve!: (v: unknown) => void;
    vi.mocked(api.get).mockReturnValue(new Promise((r) => (resolve = r)));

    const { unmount } = render(<GroupMaterialsPanel groupId="g1" />);
    expect(screen.getByTestId("group-materials-loading")).toBeInTheDocument();
    unmount();
    resolve({ data: MATERIALS });
    await Promise.resolve();
  });

  it("sair antes da falha também não atualiza o estado", async () => {
    let reject!: (e: unknown) => void;
    vi.mocked(api.get).mockReturnValue(new Promise((_, r) => (reject = r)));

    const { unmount } = render(<GroupMaterialsPanel groupId="g1" />);
    unmount();
    reject(new Error("tarde"));
    await Promise.resolve();
  });
});
