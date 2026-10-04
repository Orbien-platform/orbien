import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BankReconciliationPanel } from "./BankReconciliationPanel";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
  isForbidden: (error: unknown) => (error as { response?: { status?: number } })?.response?.status === 403,
}));

function unmatchedRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: "bst1",
    posted_at: "2026-02-01T00:00:00Z",
    amount: "150.00",
    is_credit: true,
    description: "PIX RECEBIDO JOAO",
    ...overrides,
  };
}

function report(overrides?: Partial<Record<string, unknown>>) {
  return {
    job_id: "job1",
    total: 10,
    matched: 7,
    unmatched: 2,
    duplicates: 1,
    errors: [],
    ...overrides,
  };
}

function makeFile(name: string, sizeBytes: number, type = "application/octet-stream"): File {
  const file = new File([new Uint8Array(Math.min(sizeBytes, 1024))], name, { type });
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

describe("BankReconciliationPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the unmatched list once loaded", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [unmatchedRow()], total: 1 } });
    render(<BankReconciliationPanel />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/import/ofx/unmatched"));
    expect(await screen.findByText("PIX RECEBIDO JOAO")).toBeInTheDocument();
    expect(screen.getByText(/\+R\$\s?150,00/)).toBeInTheDocument();
  });

  it("shows the empty state when there is nothing unmatched", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [], total: 0 } });
    render(<BankReconciliationPanel />);

    expect(await screen.findByText("Nenhuma transação pendente de conciliação.")).toBeInTheDocument();
  });

  it("shows a dash for a row without description", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { data: [unmatchedRow({ description: null, is_credit: false })], total: 1 },
    });
    render(<BankReconciliationPanel />);

    expect(await screen.findByText("—")).toBeInTheDocument();
    expect(screen.getByText(/−R\$\s?150,00/)).toBeInTheDocument();
  });

  it("falls back to an empty list when the response has no `data` (?? [])", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {} });
    render(<BankReconciliationPanel />);

    expect(await screen.findByText("Nenhuma transação pendente de conciliação.")).toBeInTheDocument();
  });

  it("shows NoAccessState when listing unmatched returns 403", async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { status: 403 } });
    render(<BankReconciliationPanel />);

    expect(await screen.findByText("Você não tem acesso a Conciliação bancária.")).toBeInTheDocument();
  });

  it("shows a load error with retry (not the empty state) on a non-403 failure", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get)
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ data: { data: [unmatchedRow()], total: 1 } });
    render(<BankReconciliationPanel />);

    expect(await screen.findByText("Erro ao carregar as transações não conciliadas.")).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma transação pendente de conciliação.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("PIX RECEBIDO JOAO")).toBeInTheDocument();
  });

  it("guarda contra a dupla invocação de efeito do StrictMode", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [], total: 0 } });
    render(
      <StrictMode>
        <BankReconciliationPanel />
      </StrictMode>
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/import/ofx/unmatched"));
    expect(
      vi.mocked(api.get).mock.calls.filter(([u]) => u === "/financial/import/ofx/unmatched").length
    ).toBe(1);
  });

  it("rejects a file over 10MB on the client without calling the API", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: { data: [], total: 0 } });
    render(<BankReconciliationPanel />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/import/ofx/unmatched"));

    const input = document.getElementById("ofx-file-input") as HTMLInputElement;
    const bigFile = makeFile("extrato.ofx", 11 * 1024 * 1024);
    await user.upload(input, bigFile);

    expect(await screen.findByText("Arquivo muito grande. Limite: 10 MB")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("uploads a valid file and shows the import report, then reloads the unmatched list", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: { data: [], total: 0 } });
    vi.mocked(api.post).mockResolvedValue({ data: report() });
    render(<BankReconciliationPanel />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/import/ofx/unmatched"));

    const input = document.getElementById("ofx-file-input") as HTMLInputElement;
    const file = makeFile("extrato.ofx", 1024);
    await user.upload(input, file);

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/financial/import/ofx",
        expect.any(FormData),
        { headers: { "Content-Type": "multipart/form-data" } }
      )
    );
    expect(
      await screen.findByText("10 transações no arquivo — 7 casadas, 2 não casadas, 1 já importadas antes.")
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(vi.mocked(api.get).mock.calls.filter(([u]) => u === "/financial/import/ofx/unmatched").length).toBe(2)
    );
  });

  it("shows the row-error count when the import report has parse errors", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: { data: [], total: 0 } });
    vi.mocked(api.post).mockResolvedValue({
      data: report({ errors: [{ row: 3, reason: "invalid_trnamt" }] }),
    });
    render(<BankReconciliationPanel />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/import/ofx/unmatched"));

    await user.upload(document.getElementById("ofx-file-input") as HTMLInputElement, makeFile("e.ofx", 1024));

    expect(await screen.findByText("1 linha(s) com erro de formato.")).toBeInTheDocument();
  });

  it("shows a generic error when the upload fails for a reason other than 403", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: { data: [], total: 0 } });
    vi.mocked(api.post).mockRejectedValue(new Error("boom"));
    render(<BankReconciliationPanel />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/import/ofx/unmatched"));

    await user.upload(document.getElementById("ofx-file-input") as HTMLInputElement, makeFile("e.ofx", 1024));

    expect(
      await screen.findByText("Erro ao importar o extrato. Confira se o arquivo é um OFX válido.")
    ).toBeInTheDocument();
  });

  it("switches to NoAccessState when the upload itself returns 403", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: { data: [], total: 0 } });
    vi.mocked(api.post).mockRejectedValue({ response: { status: 403 } });
    render(<BankReconciliationPanel />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/import/ofx/unmatched"));

    await user.upload(document.getElementById("ofx-file-input") as HTMLInputElement, makeFile("e.ofx", 1024));

    expect(await screen.findByText("Você não tem acesso a Conciliação bancária.")).toBeInTheDocument();
  });

  it("opens the hidden file picker when the button is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: { data: [], total: 0 } });
    render(<BankReconciliationPanel />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/import/ofx/unmatched"));

    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    await user.click(screen.getByRole("button", { name: "Selecionar arquivo .ofx" }));

    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it("does nothing when the file input change fires without a file", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [], total: 0 } });
    render(<BankReconciliationPanel />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/import/ofx/unmatched"));

    const input = document.getElementById("ofx-file-input") as HTMLInputElement;
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(input, { target: { files: [] } });

    expect(api.post).not.toHaveBeenCalled();
  });
});
