import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CreatePostModal } from "./CreatePostModal";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    defaults: { baseURL: "" },
  },
}));

const segments = [{ id: "s1", name: "Jovens" }];

class FakeXHR {
  static instances: FakeXHR[] = [];
  static shouldFail = false;
  status = 200;
  responseText = JSON.stringify({ media_url: "https://cdn.test/file.png" });
  upload: { onprogress: ((e: unknown) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  open = vi.fn();
  setRequestHeader = vi.fn();
  send = vi.fn(() => {
    queueMicrotask(() => {
      if (FakeXHR.shouldFail) this.onerror?.();
      else this.onload?.();
    });
  });
  constructor() {
    FakeXHR.instances.push(this);
  }
}

describe("CreatePostModal", () => {
  beforeEach(() => {
    FakeXHR.instances = [];
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.startsWith("/content/segments")) {
        return Promise.resolve({ data: { data: segments, total: 1 } });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  });

  it("does not render form fields when closed", () => {
    render(
      <CreatePostModal open={false} onOpenChange={vi.fn()} onCreated={vi.fn()} />
    );
    expect(screen.queryByText("Novo post")).not.toBeInTheDocument();
  });

  it("loads segments when opened, and validates required title", async () => {
    const user = userEvent.setup();
    render(<CreatePostModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/content/segments?limit=100")
    );
    expect(await screen.findByText("Jovens")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Publicar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Título é obrigatório."
    );
  });

  it("requires publish date when scheduling", async () => {
    const user = userEvent.setup();
    render(<CreatePostModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    await user.type(screen.getByLabelText(/Título/), "Meu post");
    const scheduleButtons = screen.getAllByRole("button", { name: "Agendar" });
    await user.click(scheduleButtons[0]);

    const submitButtons = screen.getAllByRole("button", { name: "Agendar" });
    await user.click(submitButtons[submitButtons.length - 1]);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Defina a data/hora de publicação."
    );
  });

  it("fills every field, toggles a segment on and off, and closes via the modal's own close button", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<CreatePostModal open={true} onOpenChange={onOpenChange} onCreated={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    await screen.findByText("Jovens");

    await user.selectOptions(screen.getByLabelText(/Tipo/), "event");
    expect(screen.getByLabelText(/Tipo/)).toHaveValue("event");

    await user.type(screen.getByLabelText(/Corpo/), "Texto do corpo");
    expect(screen.getByLabelText(/Corpo/)).toHaveValue("Texto do corpo");

    const checkbox = screen.getByRole("checkbox");
    await user.click(checkbox); // select
    expect(checkbox).toBeChecked();
    await user.click(checkbox); // deselect (covers the filter branch)
    expect(checkbox).not.toBeChecked();

    const scheduleButtons = screen.getAllByRole("button", { name: "Agendar" });
    await user.click(scheduleButtons[0]);
    await user.type(screen.getByLabelText(/Data e hora/), "2030-01-01T10:00");
    expect(screen.getByLabelText(/Data e hora/)).toHaveValue("2030-01-01T10:00");

    // Cancelar calls onOpenChange directly.
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);

    // Closing via the Modal's own close button exercises its onOpenChange wrapper (resets + notifies).
    await user.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("submits the post (link media) and shows success, then calls onCreated/onOpenChange", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <CreatePostModal open={true} onOpenChange={onOpenChange} onCreated={onCreated} />
    );
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    await user.type(screen.getByLabelText(/Título/), "Meu post");
    await user.click(screen.getByRole("checkbox"));

    await user.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/content/posts",
        expect.objectContaining({
          type: "post",
          title: "Meu post",
          segment_ids: ["s1"],
          is_draft: false,
          publish_at: null,
        })
      )
    );

    expect(await screen.findByText("Post criado!")).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(1200);

    expect(onCreated).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    vi.useRealTimers();
  });

  it("saves as draft, showing the 'Salvar rascunho' label and is_draft: true", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });

    render(<CreatePostModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    await user.type(screen.getByLabelText(/Título/), "Rascunho");
    await user.click(screen.getByRole("button", { name: "Rascunho" }));
    expect(screen.getByRole("button", { name: "Salvar rascunho" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Salvar rascunho" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/content/posts",
        expect.objectContaining({ is_draft: true })
      )
    );
  });

  it("silently ignores a failed segments fetch", async () => {
    vi.mocked(api.get).mockImplementation(() => Promise.reject(new Error("boom")));
    render(<CreatePostModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    // No segments section is rendered, and nothing throws.
    expect(screen.queryByText("Segmentos-alvo")).not.toBeInTheDocument();
  });

  it("defaults to an empty segment list when the paginated response has no data field", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.startsWith("/content/segments")) return Promise.resolve({ data: {} });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    render(<CreatePostModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByText("Segmentos-alvo")).not.toBeInTheDocument();
  });

  it("handles a flat array response for segments (no pagination wrapper)", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.startsWith("/content/segments")) {
        return Promise.resolve({ data: segments });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    render(<CreatePostModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    expect(await screen.findByText("Jovens")).toBeInTheDocument();
  });

  it("submits a scheduled post, converting the datetime-local value to ISO", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });

    render(<CreatePostModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    await user.type(screen.getByLabelText(/Título/), "Post agendado");
    const scheduleButtons = screen.getAllByRole("button", { name: "Agendar" });
    await user.click(scheduleButtons[0]);
    await user.type(screen.getByLabelText(/Data e hora/), "2030-01-01T10:00");

    const submitButtons = screen.getAllByRole("button", { name: "Agendar" });
    await user.click(submitButtons[submitButtons.length - 1]);

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/content/posts",
        expect.objectContaining({
          is_draft: false,
          publish_at: new Date("2030-01-01T10:00").toISOString(),
        })
      )
    );
  });

  it("shows the loading spinner while a submit is in flight", async () => {
    const user = userEvent.setup();
    let resolvePost!: (v: { data: unknown }) => void;
    vi.mocked(api.post).mockReturnValue(
      new Promise((resolve) => { resolvePost = resolve; })
    );

    render(<CreatePostModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    await user.type(screen.getByLabelText(/Título/), "Meu post");
    const submitBtn = screen.getByRole("button", { name: "Publicar" });
    await user.click(submitBtn);

    expect(submitBtn).toBeDisabled();
    expect(submitBtn).not.toHaveTextContent("Publicar");

    resolvePost({ data: {} });
    await waitFor(() => expect(screen.getByText("Post criado!")).toBeInTheDocument());
  });

  it("shows an error message when the API call fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue(new Error("fail"));

    render(<CreatePostModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    await user.type(screen.getByLabelText(/Título/), "Meu post");
    await user.click(screen.getByRole("button", { name: "Publicar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Erro ao criar post. Tente novamente."
    );
  });

  describe("upload de arquivo", () => {
    const originalXHR = global.XMLHttpRequest;

    beforeEach(() => {
      FakeXHR.shouldFail = false;
      // @ts-expect-error - fake XHR for jsdom
      global.XMLHttpRequest = FakeXHR;
      vi.stubEnv("NEXT_PUBLIC_API_UPLOAD_URL", "http://upload.test");
    });

    afterEach(() => {
      global.XMLHttpRequest = originalXHR;
      vi.unstubAllEnvs();
    });

    it("creates the post then uploads the selected file", async () => {
      const user = userEvent.setup();
      vi.mocked(api.post).mockResolvedValue({ data: { id: "post-1" } });
      const onCreated = vi.fn();
      const onOpenChange = vi.fn();

      render(
        <CreatePostModal open={true} onOpenChange={onOpenChange} onCreated={onCreated} />
      );
      await waitFor(() => expect(api.get).toHaveBeenCalled());

      await user.type(screen.getByLabelText(/Título/), "Post com mídia");
      await user.click(screen.getByRole("checkbox"));
      await user.click(screen.getByRole("button", { name: "Upload de arquivo" }));

      const fileInput = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      const file = new File(["conteudo"], "foto.png", { type: "image/png" });
      await user.upload(fileInput, file);

      await user.click(screen.getByRole("button", { name: "Publicar" }));

      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith(
          "/content/posts",
          expect.objectContaining({ title: "Post com mídia", segment_ids: ["s1"] })
        )
      );

      await waitFor(() => expect(onCreated).toHaveBeenCalled());
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("keeps the post but reports an error when the file upload fails, even if the media_url cleanup patch also fails", async () => {
      const user = userEvent.setup();
      vi.mocked(api.post).mockResolvedValue({ data: { id: "post-1" } });
      vi.mocked(api.patch).mockRejectedValue(new Error("patch also failed"));

      render(
        <CreatePostModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />
      );
      await waitFor(() => expect(api.get).toHaveBeenCalled());

      await user.type(screen.getByLabelText(/Título/), "Post com mídia");
      await user.click(screen.getByRole("button", { name: "Upload de arquivo" }));

      const fileInput = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      const file = new File(["conteudo"], "foto.png", { type: "image/png" });
      await user.upload(fileInput, file);

      // Make the upload fail.
      FakeXHR.shouldFail = true;

      await user.click(screen.getByRole("button", { name: "Publicar" }));

      expect(
        await screen.findByText(
          "Erro ao enviar o arquivo. O post foi salvo sem mídia."
        )
      ).toBeInTheDocument();
      expect(api.patch).toHaveBeenCalledWith("/content/posts/post-1", {
        media_url: null,
      });
    });

    it("shows a toast after uploading media, and it auto-hides after 3s", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup();
      vi.mocked(api.post).mockResolvedValue({ data: { id: "post-1" } });

      render(
        <CreatePostModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />
      );
      await waitFor(() => expect(api.get).toHaveBeenCalled());

      await user.type(screen.getByLabelText(/Título/), "Post com mídia");
      await user.click(screen.getByRole("button", { name: "Upload de arquivo" }));

      const fileInput = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      const file = new File(["conteudo"], "foto.png", { type: "image/png" });
      await user.upload(fileInput, file);

      await user.click(screen.getByRole("button", { name: "Publicar" }));

      expect(await screen.findByText("Post criado com sucesso")).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });

      expect(screen.queryByText("Post criado com sucesso")).not.toBeInTheDocument();
      vi.useRealTimers();
    });

    it("shows a generic error when creating the post itself fails, in upload mode", async () => {
      const user = userEvent.setup();
      vi.mocked(api.post).mockRejectedValue(new Error("fail"));

      render(
        <CreatePostModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />
      );
      await waitFor(() => expect(api.get).toHaveBeenCalled());

      await user.type(screen.getByLabelText(/Título/), "Post com mídia");
      await user.click(screen.getByRole("button", { name: "Upload de arquivo" }));

      const fileInput = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      const file = new File(["conteudo"], "foto.png", { type: "image/png" });
      await user.upload(fileInput, file);

      await user.click(screen.getByRole("button", { name: "Publicar" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Erro ao criar post. Tente novamente."
      );
    });
  });
});
