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
});
