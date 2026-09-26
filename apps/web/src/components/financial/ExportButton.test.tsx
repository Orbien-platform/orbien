import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExportButton } from "./ExportButton";
import api from "@/lib/api";
import { pollExportJob } from "@/lib/exportJobPolling";

vi.mock("@/lib/api", () => ({
  default: { post: vi.fn() },
}));

vi.mock("@/lib/exportJobPolling", () => ({
  pollExportJob: vi.fn(),
}));

describe("ExportButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  it("requires a period before exporting CSV", async () => {
    const user = userEvent.setup();
    render(<ExportButton periodStart="" periodEnd="" />);
    await user.click(screen.getByRole("button", { name: /CSV/ }));
    expect(
      await screen.findByText("Selecione o período antes de exportar.")
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("exports CSV for the given period", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: new Blob(["csv"]) });
    render(<ExportButton periodStart="2026-01-01" periodEnd="2026-01-31" />);

    await user.click(screen.getByRole("button", { name: /CSV/ }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/financial/export/csv",
        { period_start: "2026-01-01", period_end: "2026-01-31" },
        { responseType: "blob" }
      )
    );
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });

  it("shows an error message when the CSV export fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue(new Error("fail"));
    render(<ExportButton periodStart="2026-01-01" periodEnd="2026-01-31" />);

    await user.click(screen.getByRole("button", { name: /CSV/ }));

    expect(await screen.findByText("Erro ao exportar CSV.")).toBeInTheDocument();
  });

  it("exports a PDF with the selected type", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: new Blob(["pdf"]) });
    render(<ExportButton periodStart="2026-01-01" periodEnd="2026-01-31" />);

    await user.selectOptions(screen.getByRole("combobox"), "diario");
    await user.click(screen.getByRole("button", { name: /PDF/ }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/financial/export/pdf",
        { period_start: "2026-01-01", period_end: "2026-01-31", type: "diario" },
        { responseType: "blob" }
      )
    );
  });

  it("requires a period before exporting PDF", async () => {
    const user = userEvent.setup();
    render(<ExportButton periodStart="" periodEnd="" />);
    await user.click(screen.getByRole("button", { name: /PDF/ }));
    expect(
      await screen.findByText("Selecione o período antes de exportar.")
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("shows an error message when the PDF export fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue(new Error("fail"));
    render(<ExportButton periodStart="2026-01-01" periodEnd="2026-01-31" />);

    await user.click(screen.getByRole("button", { name: /PDF/ }));

    expect(await screen.findByText("Erro ao exportar PDF.")).toBeInTheDocument();
  });

  it("requires a period before exporting OFX", async () => {
    const user = userEvent.setup();
    render(<ExportButton periodStart="" periodEnd="" />);
    await user.click(screen.getByRole("button", { name: /OFX/ }));
    expect(
      await screen.findByText("Selecione o período antes de exportar.")
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("exports OFX for the given period (síncrono)", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: new Blob(["ofx"]) });
    render(<ExportButton periodStart="2026-01-01" periodEnd="2026-01-31" />);

    await user.click(screen.getByRole("button", { name: /OFX/ }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/financial/export/ofx",
        { period_start: "2026-01-01", period_end: "2026-01-31" },
        { responseType: "blob" }
      )
    );
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });

  it("shows an error message when the OFX export fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue(new Error("fail"));
    render(<ExportButton periodStart="2026-01-01" periodEnd="2026-01-31" />);

    await user.click(screen.getByRole("button", { name: /OFX/ }));

    expect(await screen.findByText("Erro ao exportar OFX.")).toBeInTheDocument();
  });

  it("requires a period before exporting SPED", async () => {
    const user = userEvent.setup();
    render(<ExportButton periodStart="" periodEnd="" />);
    await user.click(screen.getByRole("button", { name: /SPED/ }));
    expect(
      await screen.findByText("Selecione o período antes de exportar.")
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("exports SPED via job assíncrono e baixa sozinho ao concluir", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: { job_id: "job-1", status: "pending" } });
    vi.mocked(pollExportJob).mockResolvedValue({
      status: "done",
      downloadUrl: "https://example.com/sped.txt",
    });
    render(<ExportButton periodStart="2026-01-01" periodEnd="2026-01-31" />);

    await user.click(screen.getByRole("button", { name: /SPED/ }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/financial/export/sped", {
        period_start: "2026-01-01",
        period_end: "2026-01-31",
      })
    );
    await waitFor(() => expect(pollExportJob).toHaveBeenCalledWith("job-1", { signal: expect.any(AbortSignal) }));
    await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled());
  });

  it("shows the job's error message when the SPED job fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: { job_id: "job-2", status: "pending" } });
    vi.mocked(pollExportJob).mockResolvedValue({
      status: "error",
      errorMessage: "Falha ao gerar SPED",
    });
    render(<ExportButton periodStart="2026-01-01" periodEnd="2026-01-31" />);

    await user.click(screen.getByRole("button", { name: /SPED/ }));

    expect(await screen.findByText("Falha ao gerar SPED")).toBeInTheDocument();
  });

  it("shows a generic error when creating the SPED job itself fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue(new Error("fail"));
    render(<ExportButton periodStart="2026-01-01" periodEnd="2026-01-31" />);

    await user.click(screen.getByRole("button", { name: /SPED/ }));

    expect(await screen.findByText("Erro ao exportar SPED.")).toBeInTheDocument();
  });

  it("cancela o polling do SPED ao desmontar", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: { job_id: "job-3", status: "pending" } });
    let capturedSignal: AbortSignal | undefined;
    vi.mocked(pollExportJob).mockImplementation((_jobId, opts) => {
      capturedSignal = opts?.signal;
      return new Promise(() => {});
    });
    const { unmount } = render(<ExportButton periodStart="2026-01-01" periodEnd="2026-01-31" />);

    await user.click(screen.getByRole("button", { name: /SPED/ }));
    await waitFor(() => expect(pollExportJob).toHaveBeenCalled());

    unmount();

    expect(capturedSignal?.aborted).toBe(true);
  });
});
