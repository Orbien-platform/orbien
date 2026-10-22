import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { replaceStudyMaterialFile, uploadStudyMaterial } from "./upload-study-material";

vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));

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

  method = "";
  open(method: string, url: string) {
    this.method = method;
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

const pdf = new File(["%PDF"], "Estudo.PDF", { type: "application/pdf" });
const docx = new File(["x"], "roteiro.docx", {
  type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
});
const base = {
  title: "Estudo",
  audience: "all_networks" as const,
  visibility: "all" as const,
  publish_at: "2030-01-01T10:00:00.000Z",
};

describe("uploadStudyMaterial", () => {
  beforeEach(() => {
    FakeXHR.instances = [];
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
    vi.stubEnv("NEXT_PUBLIC_API_UPLOAD_URL", "http://upload.test");
    vi.mocked(api.post).mockReset();
    vi.mocked(api.post).mockResolvedValue({ data: { upload_token: "ticket-abc", upload_id: "up-1" } });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("pede o ticket pelo proxy e sobe o PDF na rota do upload_id, com os campos do material", async () => {
    const onProgress = vi.fn();
    const promise = uploadStudyMaterial(
      pdf,
      { ...base, audience: "network", network_id: "n1", target_group_ids: ["g1", "g2"], visibility: "leaders_only" },
      onProgress
    );

    await vi.waitFor(() => expect(FakeXHR.instances).toHaveLength(1));
    expect(api.post).toHaveBeenCalledWith("/study-materials/upload-ticket");

    const xhr = FakeXHR.instances[0];
    expect(xhr.openedUrl).toBe("http://upload.test/study-materials/upload/up-1");
    expect(xhr.headers.Authorization).toBe("Bearer ticket-abc");
    expect(xhr.sent!.get("title")).toBe("Estudo");
    expect(xhr.sent!.get("source_type")).toBe("pdf");
    expect(xhr.sent!.get("audience")).toBe("network");
    expect(xhr.sent!.get("network_id")).toBe("n1");
    expect(xhr.sent!.getAll("target_group_ids")).toEqual(["g1", "g2"]);
    expect(xhr.sent!.get("visibility")).toBe("leaders_only");
    expect(xhr.sent!.get("publish_at")).toBe("2030-01-01T10:00:00.000Z");

    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 } as ProgressEvent);
    expect(onProgress).toHaveBeenCalledWith(25);
    xhr.upload.onprogress?.({ lengthComputable: false, loaded: 1, total: 0 } as ProgressEvent);
    expect(onProgress).toHaveBeenCalledTimes(1);

    xhr.status = 201;
    xhr.responseText = JSON.stringify({ id: "m1" });
    xhr.onload?.();
    await expect(promise).resolves.toEqual({ id: "m1" });
  });

  it("Word vira source_type doc e sem rede nem PG não manda esses campos", async () => {
    const promise = uploadStudyMaterial(docx, base, vi.fn());
    await vi.waitFor(() => expect(FakeXHR.instances).toHaveLength(1));
    const xhr = FakeXHR.instances[0];
    expect(xhr.sent!.get("source_type")).toBe("doc");
    expect(xhr.sent!.has("network_id")).toBe(false);
    expect(xhr.sent!.has("target_group_ids")).toBe(false);
    xhr.status = 200;
    xhr.responseText = "{}";
    xhr.onload?.();
    await promise;
  });

  it("rejeita quando o status não é 2xx, a resposta não é JSON ou a rede cai", async () => {
    const run = async (act: (xhr: FakeXHR) => void) => {
      FakeXHR.instances = [];
      const promise = uploadStudyMaterial(pdf, base, vi.fn());
      await vi.waitFor(() => expect(FakeXHR.instances).toHaveLength(1));
      act(FakeXHR.instances[0]);
      return promise;
    };

    await expect(run((x) => { x.status = 400; x.onload?.(); })).rejects.toThrow("upload_failed_400");
    await expect(run((x) => { x.status = 200; x.responseText = "x"; x.onload?.(); })).rejects.toThrow("invalid_response");
    await expect(run((x) => x.onerror?.())).rejects.toThrow("network_error");
  });

  it("propaga o erro do ticket sem abrir o XHR", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("ticket falhou"));
    await expect(uploadStudyMaterial(pdf, base, vi.fn())).rejects.toThrow("ticket falhou");
    expect(FakeXHR.instances).toHaveLength(0);
  });

  it("lança quando NEXT_PUBLIC_API_UPLOAD_URL não está definida", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_UPLOAD_URL", "");
    await expect(uploadStudyMaterial(pdf, base, vi.fn())).rejects.toThrow("NEXT_PUBLIC_API_UPLOAD_URL");
    expect(FakeXHR.instances).toHaveLength(0);
  });
});

describe("replaceStudyMaterialFile", () => {
  beforeEach(() => {
    FakeXHR.instances = [];
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
    vi.stubEnv("NEXT_PUBLIC_API_UPLOAD_URL", "http://upload.test");
    vi.mocked(api.post).mockReset();
    vi.mocked(api.post).mockResolvedValue({ data: { upload_token: "ticket-abc", upload_id: "m1" } });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("pede o ticket do material e manda o arquivo novo por PATCH, sem source_type", async () => {
    const promise = replaceStudyMaterialFile("m1", docx, base, vi.fn());

    await vi.waitFor(() => expect(FakeXHR.instances).toHaveLength(1));
    expect(api.post).toHaveBeenCalledWith("/study-materials/m1/upload-ticket");
    const xhr = FakeXHR.instances[0];
    expect(xhr.method).toBe("PATCH");
    expect(xhr.openedUrl).toBe("http://upload.test/study-materials/upload/m1");
    expect(xhr.headers.Authorization).toBe("Bearer ticket-abc");
    expect(xhr.sent!.get("title")).toBe("Estudo");
    expect(xhr.sent!.has("source_type")).toBe(false);
    expect((xhr.sent!.get("file") as File).name).toBe("roteiro.docx");

    xhr.status = 200;
    xhr.responseText = JSON.stringify({ id: "m1" });
    xhr.onload?.();
    await expect(promise).resolves.toEqual({ id: "m1" });
  });
});
