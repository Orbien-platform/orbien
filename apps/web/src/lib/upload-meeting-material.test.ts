import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import api from "@/lib/api";
import { uploadMeetingMaterial, validateMaterialFile } from "./upload-meeting-material";

vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));

const file = (name: string, type: string, size = 10) => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

describe("validateMaterialFile", () => {
  it("aceita PDF, DOC e DOCX", () => {
    expect(validateMaterialFile(file("a.pdf", "application/pdf"))).toBeNull();
    expect(validateMaterialFile(file("a.doc", "application/msword"))).toBeNull();
    expect(
      validateMaterialFile(
        file("a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
      )
    ).toBeNull();
  });

  it("recusa outros tipos e arquivo acima de 50MB", () => {
    expect(validateMaterialFile(file("a.png", "image/png"))).toMatch(/PDF ou Word/);
    expect(validateMaterialFile(file("a.pdf", "application/pdf", 51 * 1024 * 1024))).toMatch(/50MB/);
  });
});

// ─── uploadMeetingMaterial ────────────────────────────────────────────────────

class FakeXHR {
  static instances: FakeXHR[] = [];
  status = 0;
  responseText = "";
  upload = { onprogress: null as ((e: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  headers: Record<string, string> = {};
  openedUrl = "";
  sent: FormData | null = null;

  open(_method: string, url: string) {
    this.openedUrl = url;
  }
  setRequestHeader(key: string, value: string) {
    this.headers[key] = value;
  }
  send(body: FormData) {
    this.sent = body;
    FakeXHR.instances.push(this);
  }
}

describe("uploadMeetingMaterial", () => {
  const pdf = new File(["%PDF"], "roteiro.pdf", { type: "application/pdf" });

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

  it("pede o ticket pelo proxy e sobe o arquivo direto na API com os campos do material", async () => {
    const onProgress = vi.fn();
    const promise = uploadMeetingMaterial(
      "meet1",
      { file: pdf, title: "Roteiro", visibility: "leaders_only", releaseAt: "2030-01-01T10:00:00.000Z" },
      onProgress
    );

    await vi.waitFor(() => expect(FakeXHR.instances).toHaveLength(1));
    expect(api.post).toHaveBeenCalledWith("/small-groups/meetings/meet1/materials/upload-ticket");

    const xhr = FakeXHR.instances[0];
    expect(xhr.openedUrl).toBe("http://upload.test/small-groups/meetings/meet1/materials/upload");
    expect(xhr.headers.Authorization).toBe("Bearer ticket-abc");
    expect(xhr.sent!.get("title")).toBe("Roteiro");
    expect(xhr.sent!.get("visibility")).toBe("leaders_only");
    expect(xhr.sent!.get("release_at")).toBe("2030-01-01T10:00:00.000Z");
    expect((xhr.sent!.get("file") as File).name).toBe("roteiro.pdf");

    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent);
    expect(onProgress).toHaveBeenCalledWith(50);
    xhr.upload.onprogress?.({ lengthComputable: false, loaded: 1, total: 0 } as ProgressEvent);
    expect(onProgress).toHaveBeenCalledTimes(1);

    xhr.status = 201;
    xhr.responseText = JSON.stringify({ id: "link1" });
    xhr.onload?.();
    await expect(promise).resolves.toEqual({ id: "link1" });
  });

  it("sem releaseAt não manda release_at", async () => {
    const promise = uploadMeetingMaterial("meet1", { file: pdf, title: "T", visibility: "all" }, vi.fn());
    await vi.waitFor(() => expect(FakeXHR.instances).toHaveLength(1));
    const xhr = FakeXHR.instances[0];
    expect(xhr.sent!.has("release_at")).toBe(false);
    xhr.status = 200;
    xhr.responseText = "{}";
    xhr.onload?.();
    await promise;
  });

  it("rejeita quando o status não é 2xx, a resposta não é JSON ou a rede cai", async () => {
    const run = async (act: (xhr: FakeXHR) => void) => {
      FakeXHR.instances = [];
      const promise = uploadMeetingMaterial("meet1", { file: pdf, title: "T", visibility: "all" }, vi.fn());
      await vi.waitFor(() => expect(FakeXHR.instances).toHaveLength(1));
      act(FakeXHR.instances[0]);
      return promise;
    };

    await expect(run((x) => { x.status = 413; x.onload?.(); })).rejects.toThrow("upload_failed_413");
    await expect(run((x) => { x.status = 200; x.responseText = "x"; x.onload?.(); })).rejects.toThrow("invalid_response");
    await expect(run((x) => x.onerror?.())).rejects.toThrow("network_error");
  });

  it("lança quando NEXT_PUBLIC_API_UPLOAD_URL não está definida", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_UPLOAD_URL", "");
    await expect(
      uploadMeetingMaterial("meet1", { file: pdf, title: "T", visibility: "all" }, vi.fn())
    ).rejects.toThrow("NEXT_PUBLIC_API_UPLOAD_URL");
    expect(FakeXHR.instances).toHaveLength(0);
  });
});
