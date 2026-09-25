import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pollExportJob } from "./exportJobPolling";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn() },
}));

describe("pollExportJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the download URL once the job reaches done", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { id: "job-1", status: "pending", error_message: null } })
      .mockResolvedValueOnce({ data: { id: "job-1", status: "processing", error_message: null } })
      .mockResolvedValueOnce({ data: { id: "job-1", status: "done", error_message: null } })
      .mockResolvedValueOnce({ data: { download_url: "https://example.com/file.txt", expires_in: 3600 } });

    const promise = pollExportJob("job-1", { intervalMs: 2000 });

    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(2000);

    const result = await promise;

    expect(result).toEqual({ status: "done", downloadUrl: "https://example.com/file.txt" });
    expect(api.get).toHaveBeenNthCalledWith(1, "/financial/export/jobs/job-1");
    expect(api.get).toHaveBeenNthCalledWith(4, "/financial/export/jobs/job-1/download");
  });

  it("resolves with the error message once the job reaches error", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { id: "job-2", status: "error", error_message: "Falha ao gerar SPED" },
    });

    const result = await pollExportJob("job-2", { intervalMs: 2000 });

    expect(result).toEqual({ status: "error", errorMessage: "Falha ao gerar SPED" });
  });

  it("falls back to a generic message when the job has no error_message", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { id: "job-2b", status: "error", error_message: null },
    });

    const result = await pollExportJob("job-2b", { intervalMs: 2000 });

    expect(result).toEqual({ status: "error", errorMessage: "Erro ao gerar o arquivo." });
  });

  it("resolves with a generic error when the status request itself fails", async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error("network down"));

    const result = await pollExportJob("job-2c", { intervalMs: 2000 });

    expect(result).toEqual({ status: "error", errorMessage: "Erro ao consultar o status da exportação." });
  });

  it("never settles after the signal is aborted", async () => {
    const controller = new AbortController();
    vi.mocked(api.get).mockResolvedValue({
      data: { id: "job-3", status: "pending", error_message: null },
    });

    const spy = vi.fn();
    const promise = pollExportJob("job-3", { intervalMs: 2000, signal: controller.signal });
    void promise.then(spy);

    controller.abort();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(spy).not.toHaveBeenCalled();
  });

  it("never even calls the API when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const spy = vi.fn();
    void pollExportJob("job-5", { intervalMs: 2000, signal: controller.signal }).then(spy);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(api.get).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
  });

  it("ignores a download-URL response that arrives after an abort", async () => {
    const controller = new AbortController();
    let resolveDownload!: (v: { data: { download_url: string; expires_in: number } }) => void;
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { id: "job-6", status: "done", error_message: null } })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveDownload = resolve;
          })
      );

    const spy = vi.fn();
    void pollExportJob("job-6", { intervalMs: 2000, signal: controller.signal }).then(spy);

    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    resolveDownload({ data: { download_url: "https://example.com/late.txt", expires_in: 3600 } });
    await vi.advanceTimersByTimeAsync(0);

    expect(spy).not.toHaveBeenCalled();
  });

  it("ignores a status-request rejection that arrives after an abort", async () => {
    const controller = new AbortController();
    let rejectStatus!: (err: unknown) => void;
    vi.mocked(api.get).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectStatus = reject;
        })
    );

    const spy = vi.fn();
    void pollExportJob("job-7", { intervalMs: 2000, signal: controller.signal }).then(spy);

    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    rejectStatus(new Error("network down"));
    await vi.advanceTimersByTimeAsync(0);

    expect(spy).not.toHaveBeenCalled();
  });

  it("cancels the scheduled retry timer when aborted after a pending tick", async () => {
    const controller = new AbortController();
    vi.mocked(api.get).mockResolvedValue({
      data: { id: "job-4", status: "pending", error_message: null },
    });

    const spy = vi.fn();
    const promise = pollExportJob("job-4", { intervalMs: 2000, signal: controller.signal });
    void promise.then(spy);

    // Deixa o primeiro tick agendar o retry (timer !== null) antes de abortar.
    await vi.advanceTimersByTimeAsync(0);
    const callsBeforeAbort = vi.mocked(api.get).mock.calls.length;
    controller.abort();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(vi.mocked(api.get).mock.calls.length).toBe(callsBeforeAbort);
    expect(spy).not.toHaveBeenCalled();
  });
});
