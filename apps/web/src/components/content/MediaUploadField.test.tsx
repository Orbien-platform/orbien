import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { MediaUploadField, iconForFile } from "./MediaUploadField";
import type { FileUploadState } from "@/hooks/useFileUpload";

function makeUpload(overrides: Partial<FileUploadState> = {}): FileUploadState {
  return {
    selectedFile: null,
    isDragging: false,
    isUploading: false,
    uploadProgress: 0,
    fileInputRef: { current: null },
    clearFile: vi.fn(),
    onDragOver: vi.fn(),
    onDragLeave: vi.fn(),
    onDrop: vi.fn(),
    onInputChange: vi.fn(),
    openPicker: vi.fn(),
    upload: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

describe("MediaUploadField", () => {
  it("shows a link input in link mode", () => {
    const upload = makeUpload();
    render(
      <MediaUploadField
        mode="link"
        onModeChange={vi.fn()}
        linkValue="https://x.test"
        onLinkChange={vi.fn()}
        upload={upload}
      />
    );
    expect(screen.getByPlaceholderText("https://…")).toHaveValue("https://x.test");
  });

  it("calls onLinkChange when the link input changes", async () => {
    const user = userEvent.setup();
    const onLinkChange = vi.fn();
    render(
      <MediaUploadField
        mode="link"
        onModeChange={vi.fn()}
        linkValue=""
        onLinkChange={onLinkChange}
        upload={makeUpload()}
      />
    );
    await user.type(screen.getByPlaceholderText("https://…"), "a");
    expect(onLinkChange).toHaveBeenCalled();
  });

  it("switches to upload mode via the mode toggle", async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    render(
      <MediaUploadField
        mode="link"
        onModeChange={onModeChange}
        linkValue=""
        onLinkChange={vi.fn()}
        upload={makeUpload()}
      />
    );
    await user.click(screen.getByRole("button", { name: "Upload de arquivo" }));
    expect(onModeChange).toHaveBeenCalledWith("upload");
  });

  it("switches back to link mode via the mode toggle", async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    render(
      <MediaUploadField
        mode="upload"
        onModeChange={onModeChange}
        linkValue=""
        onLinkChange={vi.fn()}
        upload={makeUpload()}
      />
    );
    await user.click(screen.getByRole("button", { name: "Link externo" }));
    expect(onModeChange).toHaveBeenCalledWith("link");
  });

  it("shows the drop zone and opens the picker on click, in upload mode with no file", async () => {
    const user = userEvent.setup();
    const upload = makeUpload();
    render(
      <MediaUploadField
        mode="upload"
        onModeChange={vi.fn()}
        linkValue=""
        onLinkChange={vi.fn()}
        upload={upload}
      />
    );
    await user.click(screen.getByText(/Arraste um arquivo aqui/));
    expect(upload.openPicker).toHaveBeenCalled();
  });

  it("shows the selected file with size, and clears it", async () => {
    const user = userEvent.setup();
    const file = new File(["conteudo"], "foto.png", { type: "image/png" });
    const upload = makeUpload({ selectedFile: file });
    render(
      <MediaUploadField
        mode="upload"
        onModeChange={vi.fn()}
        linkValue=""
        onLinkChange={vi.fn()}
        upload={upload}
      />
    );
    expect(screen.getByText("foto.png")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remover arquivo" }));
    expect(upload.clearFile).toHaveBeenCalled();
  });

  it("shows the current file with a replace action when there is no new selection", async () => {
    const user = userEvent.setup();
    const upload = makeUpload();
    render(
      <MediaUploadField
        mode="upload"
        onModeChange={vi.fn()}
        linkValue=""
        onLinkChange={vi.fn()}
        upload={upload}
        currentFile={{ name: "antigo.pdf" }}
      />
    );
    expect(screen.getByText("Mídia atual")).toBeInTheDocument();
    expect(screen.getByText("antigo.pdf")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Substituir arquivo" }));
    expect(upload.openPicker).toHaveBeenCalled();
  });

  it("shows the upload progress while uploading", () => {
    const upload = makeUpload({ isUploading: true, uploadProgress: 42, selectedFile: new File(["x"], "a.pdf") });
    render(
      <MediaUploadField
        mode="upload"
        onModeChange={vi.fn()}
        linkValue=""
        onLinkChange={vi.fn()}
        upload={upload}
      />
    );
    expect(screen.getByText("Enviando arquivo… 42%")).toBeInTheDocument();
  });

  it("disables interaction and hides remove/replace actions when disabled", () => {
    const upload = makeUpload();
    render(
      <MediaUploadField
        mode="upload"
        onModeChange={vi.fn()}
        linkValue=""
        onLinkChange={vi.fn()}
        upload={upload}
        disabled
      />
    );
    expect(
      screen.getByRole("button", { name: "Link externo" })
    ).toBeDisabled();
  });

  it("picks the right icon per file extension", () => {
    expect(iconForFile("a.pdf").props.className).toMatch(/flex-shrink-0/);
    // Smoke-test that all extension branches render without throwing.
    for (const name of ["a.mp3", "a.mp4", "a.jpg", "a.png", "a.unknown"]) {
      expect(() => iconForFile(name)).not.toThrow();
    }
  });

  it("falls back to no extension for a filename without a dot", () => {
    expect(() => iconForFile("noextension")).not.toThrow();
  });

  it("shows the 'previous file will be removed' notice when both a new file and a current file are present", () => {
    const file = new File(["conteudo"], "novo.png", { type: "image/png" });
    const upload = makeUpload({ selectedFile: file });
    render(
      <MediaUploadField
        mode="upload"
        onModeChange={vi.fn()}
        linkValue=""
        onLinkChange={vi.fn()}
        upload={upload}
        currentFile={{ name: "antigo.pdf" }}
      />
    );
    expect(screen.getByText("O arquivo anterior será removido ao salvar.")).toBeInTheDocument();
  });

  it("does not open the picker when clicking the drop zone while disabled", async () => {
    const user = userEvent.setup();
    const upload = makeUpload();
    render(
      <MediaUploadField
        mode="upload"
        onModeChange={vi.fn()}
        linkValue=""
        onLinkChange={vi.fn()}
        upload={upload}
        disabled
      />
    );
    await user.click(screen.getByText(/Arraste um arquivo aqui/));
    expect(upload.openPicker).not.toHaveBeenCalled();
  });

  it("highlights the drop zone while dragging a file over it", () => {
    const upload = makeUpload({ isDragging: true });
    render(
      <MediaUploadField
        mode="upload"
        onModeChange={vi.fn()}
        linkValue=""
        onLinkChange={vi.fn()}
        upload={upload}
      />
    );
    expect(screen.getByText(/Arraste um arquivo aqui/).closest("div")).toHaveClass("border-navy");
  });
});
