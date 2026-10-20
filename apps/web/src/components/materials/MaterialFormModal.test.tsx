import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { replaceStudyMaterialFile, uploadStudyMaterial } from "@/lib/upload-study-material";
import { MaterialFormModal, type EditableMaterial } from "./MaterialFormModal";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
vi.mock("@/lib/upload-study-material", () => ({
  uploadStudyMaterial: vi.fn(),
  replaceStudyMaterialFile: vi.fn(),
}));

const mockedApi = vi.mocked(api, true);

async function setup() {
  mockedApi.get.mockImplementation((url: string) =>
    url === "/networks"
      ? Promise.resolve({ data: [{ id: "n1", name: "Norte" }] })
      : Promise.resolve({ data: { data: [{ id: "g1", name: "Centro" }] } })
  );
  const onSaved = vi.fn();
  const onOpenChange = vi.fn();
  const user = userEvent.setup({ applyAccept: false });
  render(<MaterialFormModal open onOpenChange={onOpenChange} onSaved={onSaved} />);
  await screen.findByRole("heading", { name: "Novo material" });
  return { user, onSaved, onOpenChange };
}

describe("MaterialFormModal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exige título, conteúdo e o alvo escolhido", async () => {
    const { user } = await setup();

    await user.click(screen.getByRole("button", { name: "Publicar material" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Informe o título do material.");

    await user.type(screen.getByLabelText("Título"), "Estudo");
    await user.click(screen.getByRole("button", { name: "Publicar material" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Escolha o arquivo PDF ou Word.");

    await user.upload(screen.getByLabelText("Arquivo do material"), new File(["%PDF"], "a.pdf", { type: "application/pdf" }));
    await user.click(screen.getByLabelText("Uma rede"));
    await user.click(screen.getByRole("button", { name: "Publicar material" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Escolha a rede.");
    expect(uploadStudyMaterial).not.toHaveBeenCalled();
  });

  it("recusa arquivo que não é PDF nem Word", async () => {
    const { user } = await setup();
    await user.upload(screen.getByLabelText("Arquivo do material"), new File(["x"], "foto.png", { type: "image/png" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("PDF ou Word");
  });

  it("envia o arquivo para uma rede, só para líderes", async () => {
    vi.mocked(uploadStudyMaterial).mockResolvedValue({ id: "m1" });
    const { user, onSaved, onOpenChange } = await setup();
    const file = new File(["%PDF"], "roteiro.pdf", { type: "application/pdf" });

    await user.type(screen.getByLabelText("Título"), "Roteiro");
    await user.upload(screen.getByLabelText("Arquivo do material"), file);
    await user.click(screen.getByLabelText("Uma rede"));
    await user.selectOptions(await screen.findByLabelText("Rede"), "n1");
    await user.click(screen.getByLabelText("Somente líderes"));
    await user.click(screen.getByRole("button", { name: "Publicar material" }));

    await waitFor(() =>
      expect(uploadStudyMaterial).toHaveBeenCalledWith(
        file,
        expect.objectContaining({
          title: "Roteiro",
          audience: "network",
          network_id: "n1",
          visibility: "leaders_only",
          publish_at: expect.any(String),
        }),
        expect.any(Function)
      )
    );
    expect(onSaved).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("texto para um PG específico vai como rich_text com o PG alvo", async () => {
    mockedApi.post.mockResolvedValue({ data: { id: "m2" } });
    const { user } = await setup();

    await user.type(screen.getByLabelText("Título"), "Dinâmica");
    await user.click(screen.getByLabelText("Texto ou link"));
    await user.type(screen.getByLabelText("Texto ou link do material"), "https://exemplo.com");
    await user.click(screen.getByLabelText("Um PG"));
    await user.selectOptions(await screen.findByLabelText("PG"), "g1");
    await user.click(screen.getByRole("button", { name: "Publicar material" }));

    await waitFor(() =>
      expect(mockedApi.post).toHaveBeenCalledWith(
        "/study-materials",
        expect.objectContaining({
          source_type: "rich_text",
          rich_content: "https://exemplo.com",
          audience: "group",
          target_group_ids: ["g1"],
          visibility: "all",
        })
      )
    );
  });

  it("todas as redes não manda rede nem PG", async () => {
    vi.mocked(uploadStudyMaterial).mockResolvedValue({ id: "m1" });
    const { user } = await setup();
    await user.type(screen.getByLabelText("Título"), "Geral");
    await user.upload(screen.getByLabelText("Arquivo do material"), new File(["%PDF"], "g.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "Publicar material" }));

    await waitFor(() => expect(uploadStudyMaterial).toHaveBeenCalled());
    const fields = vi.mocked(uploadStudyMaterial).mock.calls[0][1];
    expect(fields.audience).toBe("all_networks");
    expect(fields).not.toHaveProperty("network_id");
    expect(fields).not.toHaveProperty("target_group_ids");
  });

  it("mostra mensagem específica quando o arquivo passa do limite", async () => {
    vi.mocked(uploadStudyMaterial).mockRejectedValue(new Error("upload_failed_413"));
    const { user } = await setup();
    await user.type(screen.getByLabelText("Título"), "Grande");
    await user.upload(screen.getByLabelText("Arquivo do material"), new File(["x"], "g.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "Publicar material" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Arquivo muito grande");
  });

  it("falha em /networks (plano sem redes) não apaga o seletor de PG", async () => {
    mockedApi.get.mockImplementation((url: string) =>
      url === "/networks"
        ? Promise.reject({ response: { status: 403 } })
        : Promise.resolve({ data: { data: [{ id: "g1", name: "Centro" }] } })
    );
    const user = userEvent.setup({ applyAccept: false });
    render(<MaterialFormModal open onOpenChange={vi.fn()} onSaved={vi.fn()} />);

    expect(await screen.findByText("Não foi possível carregar as redes.")).toBeInTheDocument();
    expect(screen.getByLabelText("Uma rede")).toBeDisabled();

    await user.click(screen.getByLabelText("Um PG"));
    expect(await screen.findByRole("option", { name: "Centro" })).toBeInTheDocument();
  });

  it("falha em /small-groups não apaga o seletor de rede", async () => {
    mockedApi.get.mockImplementation((url: string) =>
      url === "/networks"
        ? Promise.resolve({ data: [{ id: "n1", name: "Norte" }] })
        : Promise.reject(new Error("boom"))
    );
    const user = userEvent.setup({ applyAccept: false });
    render(<MaterialFormModal open onOpenChange={vi.fn()} onSaved={vi.fn()} />);

    expect(await screen.findByText("Não foi possível carregar os PGs.")).toBeInTheDocument();
    expect(screen.getByLabelText("Um PG")).toBeDisabled();

    await user.click(screen.getByLabelText("Uma rede"));
    expect(await screen.findByRole("option", { name: "Norte" })).toBeInTheDocument();
  });

  it("troca de volta entre as opções e manda a data de liberação escolhida", async () => {
    vi.mocked(uploadStudyMaterial).mockResolvedValue({ id: "m1" });
    const { user } = await setup();

    // Texto → arquivo, PG → todas as redes, líderes → todos: cada rádio volta ao estado inicial.
    await user.click(screen.getByLabelText("Texto ou link"));
    await user.click(screen.getByLabelText("Arquivo PDF ou Word"));
    await user.click(screen.getByLabelText("Um PG"));
    await user.click(screen.getByLabelText("Todas as redes"));
    await user.click(screen.getByLabelText("Somente líderes"));
    await user.click(screen.getByLabelText("Todos os participantes"));

    await user.type(screen.getByLabelText("Título"), "Agendado");
    await user.upload(screen.getByLabelText("Arquivo do material"), new File(["%PDF"], "a.pdf", { type: "application/pdf" }));
    fireEvent.change(screen.getByLabelText(/Liberar em/), { target: { value: "2030-01-01T10:00" } });
    await user.click(screen.getByRole("button", { name: "Publicar material" }));

    await waitFor(() => expect(uploadStudyMaterial).toHaveBeenCalled());
    const fields = vi.mocked(uploadStudyMaterial).mock.calls[0][1];
    expect(fields.audience).toBe("all_networks");
    expect(fields.visibility).toBe("all");
    expect(fields.publish_at).toBe(new Date("2030-01-01T10:00").toISOString());
  });

  it("erro 400 da API pede conferir arquivo e alcance; outro erro pede nova tentativa", async () => {
    const { user } = await setup();
    await user.type(screen.getByLabelText("Título"), "Erro");
    await user.upload(screen.getByLabelText("Arquivo do material"), new File(["x"], "a.pdf", { type: "application/pdf" }));

    vi.mocked(uploadStudyMaterial).mockRejectedValueOnce(new Error("upload_failed_400"));
    await user.click(screen.getByRole("button", { name: "Publicar material" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Confira o arquivo");

    vi.mocked(uploadStudyMaterial).mockRejectedValueOnce(new Error("network_error"));
    await user.click(screen.getByRole("button", { name: "Publicar material" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Erro ao salvar o material"));
  });

  it("mostra a barra de progresso durante o envio do arquivo", async () => {
    let report: (p: number) => void = () => {};
    let finish: (v: { id: string }) => void = () => {};
    vi.mocked(uploadStudyMaterial).mockImplementation(
      (_file, _fields, onProgress) =>
        new Promise((resolve) => {
          report = onProgress;
          finish = resolve;
        })
    );
    const { user } = await setup();
    await user.type(screen.getByLabelText("Título"), "Grande");
    await user.upload(screen.getByLabelText("Arquivo do material"), new File(["x"], "a.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "Publicar material" }));

    const bar = await screen.findByRole("progressbar");
    act(() => report(40));
    expect(bar).toHaveAttribute("aria-valuenow", "40");
    await act(async () => finish({ id: "m1" }));
  });

  it("exige título, texto e PG antes de enviar o texto", async () => {
    const { user } = await setup();
    await user.type(screen.getByLabelText("Título"), "Texto");
    await user.click(screen.getByLabelText("Texto ou link"));
    await user.click(screen.getByRole("button", { name: "Publicar material" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Escreva o texto ou cole o link.");

    await user.type(screen.getByLabelText("Texto ou link do material"), "x");
    await user.click(screen.getByLabelText("Um PG"));
    await user.click(screen.getByRole("button", { name: "Publicar material" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Escolha o PG.");
  });

  it("fechado, não renderiza nem busca redes e PGs", () => {
    render(<MaterialFormModal open={false} onOpenChange={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByRole("heading", { name: "Novo material" })).not.toBeInTheDocument();
    expect(mockedApi.get).not.toHaveBeenCalled();
  });

  it("fechar antes das listas chegarem não atualiza o formulário", async () => {
    let resolveNetworks: (v: unknown) => void = () => {};
    mockedApi.get.mockImplementation((url: string) =>
      url === "/networks"
        ? new Promise((resolve) => { resolveNetworks = resolve; })
        : Promise.resolve({ data: { data: [] } })
    );
    const { unmount } = render(<MaterialFormModal open onOpenChange={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByRole("heading", { name: "Novo material" });

    unmount();
    resolveNetworks({ data: [{ id: "n1", name: "Norte" }] });
    await Promise.resolve();
    expect(mockedApi.get).toHaveBeenCalledTimes(2);
  });

  it("resposta de PGs sem lista vira lista vazia", async () => {
    mockedApi.get.mockImplementation((url: string) =>
      url === "/networks" ? Promise.resolve({ data: [] }) : Promise.resolve({ data: {} })
    );
    const user = userEvent.setup({ applyAccept: false });
    render(<MaterialFormModal open onOpenChange={vi.fn()} onSaved={vi.fn()} />);

    await user.click(await screen.findByLabelText("Um PG"));
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });

  it("falha sem mensagem vira erro genérico", async () => {
    vi.mocked(uploadStudyMaterial).mockRejectedValue("sem mensagem");
    const { user } = await setup();
    await user.type(screen.getByLabelText("Título"), "X");
    await user.upload(screen.getByLabelText("Arquivo do material"), new File(["x"], "a.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "Publicar material" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Erro ao salvar o material");
  });

  it("limpar a escolha do arquivo volta a exigir o arquivo", async () => {
    const { user } = await setup();
    const input = screen.getByLabelText("Arquivo do material");
    await user.upload(input, new File(["x"], "a.pdf", { type: "application/pdf" }));
    fireEvent.change(input, { target: { files: [] } });
    await user.type(screen.getByLabelText("Título"), "Sem arquivo");
    await user.click(screen.getByRole("button", { name: "Publicar material" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Escolha o arquivo PDF ou Word.");
  });

  describe("edição", () => {
    const material: EditableMaterial = {
      id: "m1",
      title: "Roteiro",
      audience: "group",
      network_id: null,
      visibility: "all",
      publish_at: "2026-01-10T12:30:00.000Z",
      materialTargets: [{ small_group_id: "g1" }],
    };

    async function setupEdit(over: Partial<EditableMaterial> = {}) {
      mockedApi.get.mockImplementation((url: string) =>
        url === "/networks"
          ? Promise.resolve({ data: [{ id: "n1", name: "Norte" }] })
          : Promise.resolve({ data: { data: [{ id: "g1", name: "Centro" }] } })
      );
      const onSaved = vi.fn();
      const onOpenChange = vi.fn();
      const user = userEvent.setup({ applyAccept: false });
      render(
        <MaterialFormModal
          open
          onOpenChange={onOpenChange}
          onSaved={onSaved}
          material={{ ...material, ...over }}
        />
      );
      await screen.findByRole("heading", { name: "Editar material" });
      return { user, onSaved, onOpenChange };
    }

    it("abre com os valores do material e o arquivo opcional para substituir", async () => {
      await setupEdit();

      expect(screen.getByLabelText("Título")).toHaveValue("Roteiro");
      expect(screen.getByLabelText("Um PG")).toBeChecked();
      expect(await screen.findByLabelText("PG")).toHaveValue("g1");
      expect(screen.getByLabelText("Todos os participantes")).toBeChecked();
      expect(screen.getByLabelText("Arquivo do material")).toBeInTheDocument();
      expect(screen.queryByText("Conteúdo")).not.toBeInTheDocument();
    });

    it("substitui o arquivo enviando o novo pelo upload direto", async () => {
      vi.mocked(replaceStudyMaterialFile).mockResolvedValue({ id: "m1" });
      const { user, onSaved } = await setupEdit();

      await user.upload(
        screen.getByLabelText("Arquivo do material"),
        new File(["%PDF"], "novo.pdf", { type: "application/pdf" })
      );
      await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

      await waitFor(() =>
        expect(replaceStudyMaterialFile).toHaveBeenCalledWith(
          "m1",
          expect.objectContaining({ name: "novo.pdf" }),
          expect.objectContaining({ title: "Roteiro" }),
          expect.any(Function)
        )
      );
      expect(mockedApi.patch).not.toHaveBeenCalled();
      expect(onSaved).toHaveBeenCalled();
    });

    it("material de texto: reescreve o texto no PATCH e não pede arquivo", async () => {
      mockedApi.patch.mockResolvedValue({ data: {} });
      const { user } = await setupEdit({ source_type: "rich_text", rich_content: "https://velho.com" });

      expect(screen.queryByLabelText("Arquivo do material")).not.toBeInTheDocument();
      const box = screen.getByLabelText("Texto ou link do material");
      expect(box).toHaveValue("https://velho.com");
      await user.clear(box);
      await user.type(box, "https://novo.com");
      await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

      await waitFor(() =>
        expect(mockedApi.patch).toHaveBeenCalledWith(
          "/study-materials/m1",
          expect.objectContaining({ rich_content: "https://novo.com" })
        )
      );
    });

    it("troca para uma rede e só líderes com um PATCH, sem subir arquivo", async () => {
      mockedApi.patch.mockResolvedValue({ data: {} });
      const { user, onSaved, onOpenChange } = await setupEdit();

      await user.click(screen.getByLabelText("Uma rede"));
      await user.selectOptions(await screen.findByLabelText("Rede"), "n1");
      await user.click(screen.getByLabelText("Somente líderes"));
      await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

      await waitFor(() =>
        expect(mockedApi.patch).toHaveBeenCalledWith("/study-materials/m1", {
          title: "Roteiro",
          audience: "network",
          network_id: "n1",
          visibility: "leaders_only",
          publish_at: expect.any(String),
        })
      );
      expect(uploadStudyMaterial).not.toHaveBeenCalled();
      expect(onSaved).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("limpar a data de liberação mantém a que o material já tinha", async () => {
      mockedApi.patch.mockResolvedValue({ data: {} });
      const { user } = await setupEdit();

      fireEvent.change(screen.getByLabelText(/Liberar em/), { target: { value: "" } });
      await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

      await waitFor(() =>
        expect(mockedApi.patch).toHaveBeenCalledWith(
          "/study-materials/m1",
          expect.objectContaining({ publish_at: "2026-01-10T12:30:00.000Z" })
        )
      );
    });

    it("mostra o erro quando o PATCH falha", async () => {
      mockedApi.patch.mockRejectedValue(new Error("boom"));
      const { user, onSaved } = await setupEdit({ audience: "all_networks", materialTargets: [] });

      await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Erro ao salvar o material.");
      expect(onSaved).not.toHaveBeenCalled();
    });
  });
});
