import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PostDetailSheet, type Post } from "./PostDetailSheet";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    defaults: { baseURL: "" },
  },
}));

const draftPost: Post = {
  id: "post-1",
  title: "Post rascunho",
  body: "Corpo do post",
  type: "post" as const,
  is_draft: true,
  publish_at: null,
  created_at: "2026-09-01T10:00:00.000Z",
  media_url: null,
  segments: [{ id: "s1", name: "Jovens" }],
};

const publishedPost = {
  ...draftPost,
  id: "post-2",
  title: "Post publicado",
  is_draft: false,
  publish_at: "2020-01-01T10:00:00.000Z",
  media_url: "https://cdn.test/external.png",
};

const bareBonesPost = {
  ...draftPost,
  id: "post-5",
  is_draft: false,
  publish_at: null,
  body: undefined,
  segments: undefined,
};

function mockGet(post = draftPost, segments = [{ id: "s1", name: "Jovens" }, { id: "s2", name: "Adultos" }]) {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url === `/content/posts/${post.id}`) return Promise.resolve({ data: post });
    if (url === "/content/segments?limit=100") return Promise.resolve({ data: { data: segments } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

describe("PostDetailSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render content when closed", () => {
    mockGet();
    render(
      <PostDetailSheet
        open={false}
        onOpenChange={vi.fn()}
        postId="post-1"
        canEdit={true}
        canDelete={true}
        onUpdated={vi.fn()}
      />
    );
    expect(screen.queryByText("Post rascunho")).not.toBeInTheDocument();
  });

  it("loads and displays the post with its status and segments", async () => {
    mockGet();
    render(
      <PostDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        postId="post-1"
        canEdit={true}
        canDelete={true}
        onUpdated={vi.fn()}
      />
    );

    expect(await screen.findByText("Post rascunho")).toBeInTheDocument();
    expect(screen.getByText("Rascunho")).toBeInTheDocument();
    expect(screen.getByText("Corpo do post")).toBeInTheDocument();
    expect(screen.getByText("Jovens")).toBeInTheDocument();
  });

  it("publishes a draft post", async () => {
    mockGet();
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const onUpdated = vi.fn();
    const user = userEvent.setup();
    render(
      <PostDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        postId="post-1"
        canEdit={true}
        canDelete={true}
        onUpdated={onUpdated}
      />
    );

    await screen.findByText("Post rascunho");
    await user.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/content/posts/post-1/publish")
    );
    expect(onUpdated).toHaveBeenCalled();
  });

  it("deletes the post after confirmation", async () => {
    mockGet();
    vi.mocked(api.delete).mockResolvedValue({ data: {} });
    const onUpdated = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <PostDetailSheet
        open={true}
        onOpenChange={onOpenChange}
        postId="post-1"
        canEdit={true}
        canDelete={true}
        onUpdated={onUpdated}
      />
    );

    await screen.findByText("Post rascunho");
    await user.click(screen.getByRole("button", { name: "Excluir" }));
    expect(await screen.findByText("Confirmar exclusão?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sim" }));

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith("/content/posts/post-1")
    );
    expect(onUpdated).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("re-shows the delete action and stops the spinner when deleting fails", async () => {
    mockGet();
    vi.mocked(api.delete).mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(
      <PostDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        postId="post-1"
        canEdit={true}
        canDelete={true}
        onUpdated={vi.fn()}
      />
    );

    await screen.findByText("Post rascunho");
    await user.click(screen.getByRole("button", { name: "Excluir" }));
    await screen.findByText("Confirmar exclusão?");
    await user.click(screen.getByRole("button", { name: "Sim" }));

    await waitFor(() => expect(api.delete).toHaveBeenCalled());
    // Failure resets confirmDelete/isDeleting: the "Excluir" action reappears.
    expect(await screen.findByRole("button", { name: "Excluir" })).toBeInTheDocument();
    expect(screen.queryByText("Confirmar exclusão?")).not.toBeInTheDocument();
  });

  it("cancels the delete confirmation", async () => {
    mockGet();
    const user = userEvent.setup();
    render(
      <PostDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        postId="post-1"
        canEdit={true}
        canDelete={true}
        onUpdated={vi.fn()}
      />
    );

    await screen.findByText("Post rascunho");
    await user.click(screen.getByRole("button", { name: "Excluir" }));
    await screen.findByText("Confirmar exclusão?");
    await user.click(screen.getByRole("button", { name: "Não" }));

    expect(screen.queryByText("Confirmar exclusão?")).not.toBeInTheDocument();
  });

  it("edits the post, validating the required title and saving changes", async () => {
    mockGet();
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    const onUpdated = vi.fn();
    const user = userEvent.setup();
    render(
      <PostDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        postId="post-1"
        canEdit={true}
        canDelete={true}
        onUpdated={onUpdated}
      />
    );

    await screen.findByText("Post rascunho");
    await user.click(screen.getByRole("button", { name: "Editar" }));

    const titleInput = screen.getByDisplayValue("Post rascunho");
    await user.clear(titleInput);
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Título é obrigatório.")).toBeInTheDocument();

    await user.type(titleInput, "Título editado");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        "/content/posts/post-1",
        expect.objectContaining({ title: "Título editado" })
      )
    );
    expect(onUpdated).toHaveBeenCalled();
  });

  it("shows the scheduled badge and external link for a published post with a link", async () => {
    mockGet(publishedPost);
    render(
      <PostDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        postId="post-2"
        canEdit={false}
        canDelete={false}
        onUpdated={vi.fn()}
      />
    );

    expect(await screen.findByText("Post publicado")).toBeInTheDocument();
    expect(screen.getByText("Publicado")).toBeInTheDocument();
    expect(screen.getByText("Mídia / link externo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
  });

  it("shows an uploaded file's icon and decoded filename (link derived from the post id)", async () => {
    const uploadedPost = {
      ...draftPost,
      id: "post-3",
      is_draft: false,
      publish_at: null,
      media_url: "https://cdn.test/post-3/1690000000-Foto%20Bonita.png",
    };
    mockGet(uploadedPost);
    render(
      <PostDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        postId="post-3"
        canEdit={false}
        canDelete={false}
        onUpdated={vi.fn()}
      />
    );
    expect(await screen.findByText("Foto Bonita.png")).toBeInTheDocument();
  });

  it("shows the scheduled badge and date for a future-dated post", async () => {
    const scheduledPost = {
      ...draftPost,
      id: "post-4",
      is_draft: false,
      publish_at: "2099-01-01T10:00:00.000Z",
      media_url: null,
    };
    mockGet(scheduledPost);
    render(
      <PostDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        postId="post-4"
        canEdit={false}
        canDelete={false}
        onUpdated={vi.fn()}
      />
    );
    expect(await screen.findByText("Agendado")).toBeInTheDocument();
    expect(screen.getByText(/Agendado para/)).toBeInTheDocument();
  });

  it("keeps the loading spinner when fetching the post fails", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/content/posts/post-1") return Promise.reject(new Error("boom"));
      if (url === "/content/segments?limit=100")
        return Promise.resolve({ data: { data: [] } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    render(
      <PostDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        postId="post-1"
        canEdit={true}
        canDelete={true}
        onUpdated={vi.fn()}
      />
    );
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByText("Post rascunho")).not.toBeInTheDocument();
  });

  it("deselects and selects segments while editing, then cancels back to view mode", async () => {
    mockGet();
    const user = userEvent.setup();
    render(
      <PostDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        postId="post-1"
        canEdit={true}
        canDelete={true}
        onUpdated={vi.fn()}
      />
    );
    await screen.findByText("Post rascunho");
    await user.click(screen.getByRole("button", { name: "Editar" }));

    const bodyField = screen.getByDisplayValue("Corpo do post");
    await user.type(bodyField, " editado");
    expect(bodyField).toHaveValue("Corpo do post editado");

    const jovensCheckbox = screen.getByLabelText("Jovens");
    expect(jovensCheckbox).toBeChecked();
    await user.click(jovensCheckbox); // deselect (filter branch)
    expect(jovensCheckbox).not.toBeChecked();

    const adultosCheckbox = screen.getByLabelText("Adultos");
    expect(adultosCheckbox).not.toBeChecked();
    await user.click(adultosCheckbox); // select (spread branch)
    expect(adultosCheckbox).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument();
    expect(screen.getByText("Post rascunho")).toBeInTheDocument();
  });

  it("uploads a file while saving edits, shows a toast that auto-hides", async () => {
    mockGet();
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    const originalXHR = global.XMLHttpRequest;
    class FakeXHR {
      status = 200;
      responseText = JSON.stringify({ media_url: "https://cdn.test/post-1/x.png" });
      upload: { onprogress: ((e: unknown) => void) | null } = { onprogress: null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      open = vi.fn();
      setRequestHeader = vi.fn();
      send = vi.fn(() => {
        queueMicrotask(() => this.onload?.());
      });
    }
    // @ts-expect-error - fake XHR for jsdom
    global.XMLHttpRequest = FakeXHR;
    vi.mocked(api.post).mockResolvedValue({ data: { upload_token: "tok" } });
    vi.stubEnv("NEXT_PUBLIC_API_UPLOAD_URL", "http://upload.test");

    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup();
    render(
      <PostDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        postId="post-1"
        canEdit={true}
        canDelete={true}
        onUpdated={vi.fn()}
      />
    );
    await screen.findByText("Post rascunho");
    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: "Upload de arquivo" }));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["conteudo"], "foto.png", { type: "image/png" });
    await user.upload(fileInput, file);

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Post atualizado com sucesso")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.queryByText("Post atualizado com sucesso")).not.toBeInTheDocument();
    vi.useRealTimers();

    global.XMLHttpRequest = originalXHR;
    vi.unstubAllEnvs();
  });

  it("keeps editing open and reports an error when the file upload fails during save", async () => {
    mockGet();
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    const onUpdated = vi.fn();
    const originalXHR = global.XMLHttpRequest;
    class FailingXHR {
      status = 500;
      responseText = "";
      upload: { onprogress: ((e: unknown) => void) | null } = { onprogress: null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      open = vi.fn();
      setRequestHeader = vi.fn();
      send = vi.fn(() => {
        queueMicrotask(() => this.onerror?.());
      });
    }
    // @ts-expect-error - fake XHR for jsdom
    global.XMLHttpRequest = FailingXHR;

    const user = userEvent.setup();
    render(
      <PostDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        postId="post-1"
        canEdit={true}
        canDelete={true}
        onUpdated={onUpdated}
      />
    );
    await screen.findByText("Post rascunho");
    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: "Upload de arquivo" }));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["conteudo"], "foto.png", { type: "image/png" });
    await user.upload(fileInput, file);

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(
      await screen.findByText("Erro ao enviar o arquivo. As demais alterações foram salvas.")
    ).toBeInTheDocument();
    expect(onUpdated).toHaveBeenCalled();
    // Editing stays open (the function returns before setEditing(false)).
    expect(screen.getByRole("button", { name: "Salvar" })).toBeInTheDocument();

    global.XMLHttpRequest = originalXHR;
  });

  it("no-ops publish/delete/save once postId becomes null while the sheet stays open", async () => {
    mockGet();
    const user = userEvent.setup();
    const { rerender } = render(
      <PostDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        postId="post-1"
        canEdit={true}
        canDelete={true}
        onUpdated={vi.fn()}
      />
    );
    await screen.findByText("Post rascunho");

    rerender(
      <PostDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        postId={null}
        canEdit={true}
        canDelete={true}
        onUpdated={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Publicar" }));
    expect(api.post).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Excluir" }));
    await screen.findByText("Confirmar exclusão?");
    await user.click(screen.getByRole("button", { name: "Sim" }));
    expect(api.delete).not.toHaveBeenCalled();
    // handleDelete returns before touching confirmDelete/isDeleting, so the dialog stays open.
    expect(screen.getByText("Confirmar exclusão?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Não" }));

    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("ignores a response that resolves after the sheet was unmounted (cancellation)", async () => {
    let resolveGet!: (v: { data: unknown }) => void;
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/content/posts/post-1") {
        return new Promise((resolve) => { resolveGet = resolve; });
      }
      return Promise.resolve({ data: { data: [] } });
    });
    const { unmount } = render(
      <PostDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        postId="post-1"
        canEdit={true}
        canDelete={true}
        onUpdated={vi.fn()}
      />
    );
    unmount();
    // The response arrives after unmount: the cancelled `.then` must no-op without throwing.
    expect(() => resolveGet({ data: draftPost })).not.toThrow();
    await Promise.resolve();
  });

  it("keeps segments empty when their fetch fails, and shows unknown post types verbatim", async () => {
    const weirdTypePost = { ...draftPost, type: "legacy_broadcast" as never };
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/content/posts/post-1") return Promise.resolve({ data: weirdTypePost });
      if (url === "/content/segments?limit=100") return Promise.reject(new Error("boom"));
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    render(
      <PostDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        postId="post-1"
        canEdit={true}
        canDelete={true}
        onUpdated={vi.fn()}
      />
    );
    expect(await screen.findByText("Post rascunho")).toBeInTheDocument();
    expect(screen.getByText("legacy_broadcast")).toBeInTheDocument();
  });

  it("handles a flat array response for the segments picker (no pagination wrapper)", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/content/posts/post-1") return Promise.resolve({ data: draftPost });
      if (url === "/content/segments?limit=100")
        return Promise.resolve({ data: [{ id: "s2", name: "Adultos" }] });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    const user = userEvent.setup();
    render(
      <PostDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        postId="post-1"
        canEdit={true}
        canDelete={true}
        onUpdated={vi.fn()}
      />
    );
    await screen.findByText("Post rascunho");
    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByLabelText("Adultos")).toBeInTheDocument();
  });

  it("defaults the segments picker to empty when the paginated response has no data field", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/content/posts/post-1") return Promise.resolve({ data: draftPost });
      if (url === "/content/segments?limit=100") return Promise.resolve({ data: {} });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    const user = userEvent.setup();
    render(
      <PostDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        postId="post-1"
        canEdit={true}
        canDelete={true}
        onUpdated={vi.fn()}
      />
    );
    await screen.findByText("Post rascunho");
    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.queryByText("Segmentos")).not.toBeInTheDocument();
  });

  it("shows 'Sem conteúdo.' and hides the segments block for a post with no body and no segments, and saves an empty body/segments payload", async () => {
    mockGet(bareBonesPost, []);
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(
      <PostDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        postId="post-5"
        canEdit={true}
        canDelete={true}
        onUpdated={vi.fn()}
      />
    );
    expect(await screen.findByText("Sem conteúdo.")).toBeInTheDocument();
    expect(screen.queryByText("Segmentos")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        "/content/posts/post-5",
        expect.objectContaining({ body: undefined, segment_ids: undefined })
      )
    );
  });

  it("shows the current uploaded file in edit mode and lets the media_url change be saved", async () => {
    const uploadedPost = {
      ...draftPost,
      id: "post-3",
      is_draft: false,
      media_url: "https://cdn.test/post-3/1690000000-foto.png",
    };
    mockGet(uploadedPost);
    const user = userEvent.setup();
    render(
      <PostDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        postId="post-3"
        canEdit={true}
        canDelete={true}
        onUpdated={vi.fn()}
      />
    );
    await screen.findByText("Post rascunho");
    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByText("Mídia atual")).toBeInTheDocument();
    expect(screen.getByText("foto.png")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Substituir arquivo" })).toBeInTheDocument();
  });

  it("saves a changed external link, sending the new media_url", async () => {
    mockGet(publishedPost);
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(
      <PostDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        postId="post-2"
        canEdit={true}
        canDelete={true}
        onUpdated={vi.fn()}
      />
    );
    await screen.findByText("Post publicado");
    await user.click(screen.getByRole("button", { name: "Editar" }));

    const linkInput = screen.getByDisplayValue("https://cdn.test/external.png");
    await user.clear(linkInput);
    await user.type(linkInput, "https://cdn.test/new-link.png");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        "/content/posts/post-2",
        expect.objectContaining({ media_url: "https://cdn.test/new-link.png" })
      )
    );
  });

  it("does not resend media_url when the link is edited but left unchanged", async () => {
    mockGet(publishedPost);
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(
      <PostDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        postId="post-2"
        canEdit={true}
        canDelete={true}
        onUpdated={vi.fn()}
      />
    );
    await screen.findByText("Post publicado");
    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    const payload = vi.mocked(api.patch).mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("media_url");
  });

  it("shows an error message when saving fails", async () => {
    mockGet();
    vi.mocked(api.patch).mockRejectedValue(new Error("fail"));
    const user = userEvent.setup();
    render(
      <PostDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        postId="post-1"
        canEdit={true}
        canDelete={true}
        onUpdated={vi.fn()}
      />
    );

    await screen.findByText("Post rascunho");
    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Erro ao salvar alterações.")).toBeInTheDocument();
  });
});
