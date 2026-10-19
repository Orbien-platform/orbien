import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { uploadStudyMaterial } from "@/lib/upload-study-material";
import { MaterialFormModal } from "./MaterialFormModal";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/lib/upload-study-material", () => ({ uploadStudyMaterial: vi.fn() }));

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
});
