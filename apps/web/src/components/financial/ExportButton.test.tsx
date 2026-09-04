import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExportButton } from "./ExportButton";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { post: vi.fn() },
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
});
