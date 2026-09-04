import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  default: { post: vi.fn() },
}));

import api from "@/lib/api";
import {
  ACCEPTED_MIME_TYPES,
  formatFileSize,
  MAX_FILE_SIZE,
  useFileUpload,
  uploadPostMedia,
  validateMediaFile,
} from "./useFileUpload";

function makeFile(name: string, size: number, type: string): File {
  const file = new File([new Uint8Array(Math.max(size, 0))], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("validateMediaFile", () => {
  it("rejeita arquivo maior que o limite", () => {
    const file = makeFile("big.pdf", MAX_FILE_SIZE + 1, "application/pdf");
    expect(validateMediaFile(file)).toMatch(/muito grande/);
  });

  it("rejeita formato não suportado", () => {
    const file = makeFile("a.txt", 10, "text/plain");
    expect(validateMediaFile(file)).toMatch(/não suportado/);
  });

  it("aceita formatos suportados dentro do limite", () => {
    for (const type of ACCEPTED_MIME_TYPES) {
      const file = makeFile("a", 10, type);
      expect(validateMediaFile(file)).toBeNull();
    }
  });
});

describe("formatFileSize", () => {
  it("formata bytes, KB e MB", () => {
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(2048)).toBe("2,0 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5,0 MB");
  });
});

class FakeXHR {
  static instances: FakeXHR[] = [];
  status = 0;
  responseText = "";
  upload = { onprogress: null as ((e: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  headers: Record<string, string> = {};
  openedUrl = "";

  open(_method: string, url: string) {
    this.openedUrl = url;
  }

  setRequestHeader(key: string, value: string) {
    this.headers[key] = value;
  }

  send() {
    FakeXHR.instances.push(this);
  }
}

describe("uploadPostMedia", () => {
  beforeEach(() => {
    FakeXHR.instances = [];
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
    vi.stubEnv("NEXT_PUBLIC_API_UPLOAD_URL", "http://upload.test");
    vi.mocked(api.post).mockReset();
    vi.mocked(api.post).mockResolvedValue({ data: { upload_token: "ticket-abc" } });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("pede o ticket pelo proxy antes de subir o arquivo direto na API", async () => {
    const onProgress = vi.fn();
    const promise = uploadPostMedia("post1", makeFile("a.pdf", 10, "application/pdf"), onProgress);

    await vi.waitFor(() => expect(FakeXHR.instances).toHaveLength(1));
    expect(api.post).toHaveBeenCalledWith("/content/posts/post1/upload-ticket");

    const xhr = FakeXHR.instances[0];
    expect(xhr.openedUrl).toBe("http://upload.test/content/posts/post1/upload");
    expect(xhr.headers.Authorization).toBe("Bearer ticket-abc");

    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent);
    expect(onProgress).toHaveBeenCalledWith(50);

    xhr.status = 201;
    xhr.responseText = JSON.stringify({ media_url: "https://cdn/x" });
    xhr.onload?.();

    await expect(promise).resolves.toEqual({ media_url: "https://cdn/x" });
  });

  it("ignora progresso não computável", async () => {
    const onProgress = vi.fn();
    const promise = uploadPostMedia("post1", makeFile("a.pdf", 10, "application/pdf"), onProgress);
    await vi.waitFor(() => expect(FakeXHR.instances).toHaveLength(1));
    const xhr = FakeXHR.instances[0];

    xhr.upload.onprogress?.({ lengthComputable: false, loaded: 50, total: 100 } as ProgressEvent);
    expect(onProgress).not.toHaveBeenCalled();

    xhr.status = 200;
    xhr.responseText = "{}";
    xhr.onload?.();
    await promise;
  });

  it("rejeita quando o status não é 2xx", async () => {
    const promise = uploadPostMedia("post1", makeFile("a.pdf", 10, "application/pdf"), vi.fn());
    await vi.waitFor(() => expect(FakeXHR.instances).toHaveLength(1));
    const xhr = FakeXHR.instances[0];
    xhr.status = 500;
    xhr.onload?.();

    await expect(promise).rejects.toThrow("upload_failed_500");
  });

  it("rejeita quando a resposta 2xx não é JSON válido", async () => {
    const promise = uploadPostMedia("post1", makeFile("a.pdf", 10, "application/pdf"), vi.fn());
    await vi.waitFor(() => expect(FakeXHR.instances).toHaveLength(1));
    const xhr = FakeXHR.instances[0];
    xhr.status = 200;
    xhr.responseText = "not-json";
    xhr.onload?.();

    await expect(promise).rejects.toThrow("invalid_response");
  });

  it("rejeita em erro de rede", async () => {
    const promise = uploadPostMedia("post1", makeFile("a.pdf", 10, "application/pdf"), vi.fn());
    await vi.waitFor(() => expect(FakeXHR.instances).toHaveLength(1));
    const xhr = FakeXHR.instances[0];
    xhr.onerror?.();

    await expect(promise).rejects.toThrow("network_error");
  });

  it("propaga o erro do ticket sem chegar a abrir o XHR", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("upload-ticket falhou"));

    await expect(
      uploadPostMedia("post1", makeFile("a.pdf", 10, "application/pdf"), vi.fn())
    ).rejects.toThrow("upload-ticket falhou");
    expect(FakeXHR.instances).toHaveLength(0);
  });

  it("lança quando NEXT_PUBLIC_API_UPLOAD_URL não está definida", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_UPLOAD_URL", "");

    await expect(
      uploadPostMedia("post1", makeFile("a.pdf", 10, "application/pdf"), vi.fn())
    ).rejects.toThrow("NEXT_PUBLIC_API_UPLOAD_URL");
  });
});

describe("useFileUpload", () => {
  beforeEach(() => {
    FakeXHR.instances = [];
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
    vi.stubEnv("NEXT_PUBLIC_API_UPLOAD_URL", "http://upload.test");
    vi.mocked(api.post).mockReset();
    vi.mocked(api.post).mockResolvedValue({ data: { upload_token: "ticket-abc" } });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("seleciona um arquivo válido via input e permite limpar", () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useFileUpload(onError));

    const file = makeFile("a.pdf", 10, "application/pdf");
    act(() => {
      result.current.onInputChange({
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.selectedFile).toBe(file);
    expect(onError).not.toHaveBeenCalled();

    act(() => result.current.clearFile());
    expect(result.current.selectedFile).toBeNull();
  });

  it("clearFile também zera o valor do input quando a ref já está montada", () => {
    const { result } = renderHook(() => useFileUpload(vi.fn()));
    // @ts-expect-error stub do input escondido, como se estivesse montado no DOM
    result.current.fileInputRef.current = { value: "a.pdf" };

    act(() => result.current.clearFile());

    expect(result.current.fileInputRef.current?.value).toBe("");
  });

  it("chama onError e não seleciona quando o arquivo é inválido", () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useFileUpload(onError));

    const file = makeFile("a.txt", 10, "text/plain");
    act(() => {
      result.current.onInputChange({
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    expect(onError).toHaveBeenCalled();
    expect(result.current.selectedFile).toBeNull();
  });

  it("ignora onInputChange sem arquivo selecionado", () => {
    const { result } = renderHook(() => useFileUpload(vi.fn()));

    act(() => {
      result.current.onInputChange({
        target: { files: [] },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.selectedFile).toBeNull();
  });

  it("controla o estado de drag e seleciona no drop", () => {
    const { result } = renderHook(() => useFileUpload(vi.fn()));
    const file = makeFile("a.pdf", 10, "application/pdf");
    const preventDefault = vi.fn();

    act(() => {
      result.current.onDragOver({ preventDefault } as unknown as React.DragEvent<HTMLDivElement>);
    });
    expect(result.current.isDragging).toBe(true);

    act(() => {
      result.current.onDrop({
        preventDefault,
        dataTransfer: { files: [file] },
      } as unknown as React.DragEvent<HTMLDivElement>);
    });
    expect(result.current.isDragging).toBe(false);
    expect(result.current.selectedFile).toBe(file);

    act(() => result.current.onDragLeave());
    expect(result.current.isDragging).toBe(false);
  });

  it("ignora drop sem arquivo", () => {
    const { result } = renderHook(() => useFileUpload(vi.fn()));

    act(() => {
      result.current.onDrop({
        preventDefault: vi.fn(),
        dataTransfer: { files: [] },
      } as unknown as React.DragEvent<HTMLDivElement>);
    });

    expect(result.current.selectedFile).toBeNull();
  });

  it("upload lança quando não há arquivo selecionado", async () => {
    const { result } = renderHook(() => useFileUpload(vi.fn()));

    await expect(result.current.upload("post1")).rejects.toThrow("no_file_selected");
  });

  it("faz upload do arquivo selecionado e atualiza isUploading", async () => {
    const { result } = renderHook(() => useFileUpload(vi.fn()));
    const file = makeFile("a.pdf", 10, "application/pdf");

    act(() => {
      result.current.onInputChange({
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    let uploadPromise!: Promise<{ media_url: string }>;
    act(() => {
      uploadPromise = result.current.upload("post1");
    });

    await waitFor(() => expect(result.current.isUploading).toBe(true));
    await waitFor(() => expect(FakeXHR.instances).toHaveLength(1));

    const xhr = FakeXHR.instances[0];
    xhr.status = 200;
    xhr.responseText = JSON.stringify({ media_url: "https://cdn/x" });
    xhr.onload?.();
    await act(async () => {
      await uploadPromise;
    });

    await expect(uploadPromise).resolves.toEqual({ media_url: "https://cdn/x" });
    expect(result.current.isUploading).toBe(false);
  });

  it("reset limpa todo o estado", () => {
    const { result } = renderHook(() => useFileUpload(vi.fn()));
    const file = makeFile("a.pdf", 10, "application/pdf");

    act(() => {
      result.current.onInputChange({
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });
    act(() => result.current.reset());

    expect(result.current.selectedFile).toBeNull();
    expect(result.current.isDragging).toBe(false);
    expect(result.current.isUploading).toBe(false);
    expect(result.current.uploadProgress).toBe(0);
  });

  it("reset também zera o valor do input quando a ref já está montada", () => {
    const { result } = renderHook(() => useFileUpload(vi.fn()));
    // @ts-expect-error stub do input escondido, como se estivesse montado no DOM
    result.current.fileInputRef.current = { value: "a.pdf" };

    act(() => result.current.reset());

    expect(result.current.fileInputRef.current?.value).toBe("");
  });

  it("openPicker aciona o clique no input escondido", () => {
    const { result } = renderHook(() => useFileUpload(vi.fn()));
    const click = vi.fn();
    // @ts-expect-error atribuindo um stub ao ref para o teste
    result.current.fileInputRef.current = { click, value: "" };

    act(() => result.current.openPicker());

    expect(click).toHaveBeenCalled();
  });
});
