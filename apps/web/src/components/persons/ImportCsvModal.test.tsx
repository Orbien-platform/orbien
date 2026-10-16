import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { ImportCsvModal } from "./ImportCsvModal";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { post: vi.fn(), get: vi.fn() },
}));

// `detected_columns` é o nome real do campo na resposta da API
// (`apps/api/src/persons/dto/import-preview.dto.ts`). Estes mocks diziam
// `columns`, e por isso passavam verdes enquanto a importação estava quebrada
// de verdade — o mock afirmava um contrato que a API nunca enviou. Quem pegou
// foi o e2e, contra a API real; ver `apps/web/e2e/pessoas.spec.ts`.
const preview = {
  file_id: "abc.csv",
  detected_columns: ["nome", "telefone"],
  preview_rows: [{ nome: "Ana", telefone: "54999998888" }],
  suggested_mapping: { nome: "nome", telefone: "telefone" },
};

describe("ImportCsvModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render content when closed", () => {
    render(<ImportCsvModal open={false} onOpenChange={vi.fn()} onImported={vi.fn()} />);
    expect(screen.queryByText("Importar CSV")).not.toBeInTheDocument();
  });

  it("uploads a CSV via file input and moves to the mapping step", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: preview });

    render(<ImportCsvModal open={true} onOpenChange={vi.fn()} onImported={vi.fn()} />);

    const file = new File(["nome,telefone\nAna,54999998888"], "pessoas.csv", {
      type: "text/csv",
    });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/persons/import",
        expect.any(FormData),
        { headers: { "Content-Type": "multipart/form-data" } }
      )
    );

    expect(await screen.findByText("pessoas.csv")).toBeInTheDocument();
    expect(screen.getByText("1 linha(s) de prévia · 2 colunas detectadas")).toBeInTheDocument();
  });

  it("shows an error when the file fails to process", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue(new Error("fail"));

    render(<ImportCsvModal open={true} onOpenChange={vi.fn()} onImported={vi.fn()} />);

    const file = new File(["bad"], "pessoas.csv", { type: "text/csv" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);

    expect(
      await screen.findByText(
        "Não foi possível processar o arquivo. Verifique se é um CSV válido."
      )
    ).toBeInTheDocument();
  });

  it("rejects a dropped file that isn't .csv", async () => {
    render(<ImportCsvModal open={true} onOpenChange={vi.fn()} onImported={vi.fn()} />);

    const dropzone = screen.getByText("Arraste um arquivo .csv aqui").closest("div")!;
    const file = new File(["x"], "pessoas.xlsx", { type: "application/vnd.ms-excel" });
    const dataTransfer = { files: [file] };

    dropzone.dispatchEvent(
      Object.assign(new Event("drop", { bubbles: true, cancelable: true }), { dataTransfer })
    );

    expect(
      await screen.findByText("Apenas arquivos .csv são aceitos.")
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("goes back to the upload step and clears the file", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: preview });

    render(<ImportCsvModal open={true} onOpenChange={vi.fn()} onImported={vi.fn()} />);
    const file = new File(["x"], "pessoas.csv", { type: "text/csv" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);
    await screen.findByText("pessoas.csv");

    await user.click(screen.getByRole("button", { name: "Remover arquivo" }));

    expect(screen.getByText("Arraste um arquivo .csv aqui")).toBeInTheDocument();
  });

  it("confirms the import and shows the result summary", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === "/persons/import") return Promise.resolve({ data: preview });
      if (url === "/persons/import/confirm")
        return Promise.resolve({ data: { imported: 1, skipped: 0, errors: [] } });
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });

    render(<ImportCsvModal open={true} onOpenChange={vi.fn()} onImported={vi.fn()} />);
    const file = new File(["x"], "pessoas.csv", { type: "text/csv" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);
    await screen.findByText("pessoas.csv");

    await user.click(screen.getByRole("button", { name: "Importar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/persons/import/confirm", {
        file_id: "abc.csv",
        mapping: { nome: "nome", telefone: "telefone" },
      })
    );
    expect(await screen.findByText("Importação concluída sem erros!")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("shows import errors in the result step and calls onImported on Concluir", async () => {
    const user = userEvent.setup();
    const onImported = vi.fn();
    const onOpenChange = vi.fn();
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === "/persons/import") return Promise.resolve({ data: preview });
      if (url === "/persons/import/confirm")
        return Promise.resolve({
          data: { imported: 1, skipped: 1, errors: [{ row: 2, reason: "missing_phone_and_email" }] },
        });
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });

    render(
      <ImportCsvModal open={true} onOpenChange={onOpenChange} onImported={onImported} />
    );
    const file = new File(["x"], "pessoas.csv", { type: "text/csv" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);
    await screen.findByText("pessoas.csv");
    await user.click(screen.getByRole("button", { name: "Importar" }));

    expect(await screen.findByText("1 erro(s)")).toBeInTheDocument();
    expect(screen.getByText("Linha 2: sem telefone nem e-mail")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Concluir" }));
    expect(onImported).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows an error message when confirming the import fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === "/persons/import") return Promise.resolve({ data: preview });
      if (url === "/persons/import/confirm") return Promise.reject(new Error("fail"));
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });

    render(<ImportCsvModal open={true} onOpenChange={vi.fn()} onImported={vi.fn()} />);
    const file = new File(["x"], "pessoas.csv", { type: "text/csv" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);
    await screen.findByText("pessoas.csv");
    await user.click(screen.getByRole("button", { name: "Importar" }));

    expect(await screen.findByText("Erro ao importar. Tente novamente.")).toBeInTheDocument();
  });

  it("blocks the import when no column is mapped to the name", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({
      data: { ...preview, suggested_mapping: {} },
    });

    render(<ImportCsvModal open={true} onOpenChange={vi.fn()} onImported={vi.fn()} />);
    const file = new File(["x"], "pessoas.csv", { type: "text/csv" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);
    await screen.findByText("pessoas.csv");
    await user.click(screen.getByRole("button", { name: "Importar" }));

    expect(await screen.findByText("Escolha qual coluna é o nome completo.")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("follows the job when the API runs the import in the background", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === "/persons/import") return Promise.resolve({ data: preview });
      if (url === "/persons/import/confirm")
        return Promise.resolve({ data: { job_id: "job-1", status: "pending" } });
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });
    vi.mocked(api.get).mockResolvedValue({
      data: { status: "done", imported: 600, skipped: 0, errors: [] },
    });

    render(<ImportCsvModal open={true} onOpenChange={vi.fn()} onImported={vi.fn()} />);
    const file = new File(["x"], "pessoas.csv", { type: "text/csv" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);
    await screen.findByText("pessoas.csv");
    await user.click(screen.getByRole("button", { name: "Importar" }));

    expect(await screen.findByText("600", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/persons/import/jobs/job-1");
  });

  describe("background job", () => {
    async function startJob(jobResponses: Array<{ status: string }>) {
      const user = userEvent.setup();
      vi.mocked(api.post).mockImplementation((url: string) => {
        if (url === "/persons/import") return Promise.resolve({ data: preview });
        if (url === "/persons/import/confirm")
          return Promise.resolve({ data: { job_id: "job-1", status: "pending" } });
        return Promise.reject(new Error(`unexpected POST ${url}`));
      });
      const get = vi.mocked(api.get);
      for (const r of jobResponses) get.mockResolvedValueOnce({ data: r });
      get.mockResolvedValue({ data: { status: "processing" } });

      render(<ImportCsvModal open={true} onOpenChange={vi.fn()} onImported={vi.fn()} />);
      const file = new File(["x"], "pessoas.csv", { type: "text/csv" });
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      await user.upload(fileInput, file);
      await screen.findByText("pessoas.csv");

      vi.useFakeTimers();
      fireEvent.click(screen.getByRole("button", { name: "Importar" }));
    }

    afterEach(() => vi.useRealTimers());

    it("shows the import error when the job fails", async () => {
      await startJob([{ status: "processing" }, { status: "error" }]);
      await act(() => vi.advanceTimersByTimeAsync(2000 * 2));
      vi.useRealTimers();
      expect(await screen.findByText("Erro ao importar. Tente novamente.")).toBeInTheDocument();
    });

    it("gives up when the job never finishes", async () => {
      await startJob([]);
      await act(() => vi.advanceTimersByTimeAsync(2000 * 151));
      vi.useRealTimers();
      expect(await screen.findByText("Erro ao importar. Tente novamente.")).toBeInTheDocument();
      expect(api.get).toHaveBeenCalledTimes(150);
    });
  });

  it("uploads a dropped .csv file", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: preview });

    render(<ImportCsvModal open={true} onOpenChange={vi.fn()} onImported={vi.fn()} />);

    const dropzone = screen.getByText("Arraste um arquivo .csv aqui").closest("div")!;
    const file = new File(["nome,telefone\nAna,54999998888"], "pessoas.csv", {
      type: "text/csv",
    });
    const dataTransfer = { files: [file] };

    dropzone.dispatchEvent(
      Object.assign(new Event("dragover", { bubbles: true, cancelable: true }), { dataTransfer })
    );
    dropzone.dispatchEvent(
      Object.assign(new Event("drop", { bubbles: true, cancelable: true }), { dataTransfer })
    );

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/persons/import",
        expect.any(FormData),
        { headers: { "Content-Type": "multipart/form-data" } }
      )
    );
    expect(await screen.findByText("pessoas.csv")).toBeInTheDocument();
  });

  it("highlights the dropzone while dragging, and clears it on dragleave", async () => {
    render(<ImportCsvModal open={true} onOpenChange={vi.fn()} onImported={vi.fn()} />);

    const dropzone = screen
      .getByText("Arraste um arquivo .csv aqui")
      .closest(".cursor-pointer")!;
    dropzone.dispatchEvent(new Event("dragover", { bubbles: true, cancelable: true }));
    await waitFor(() => expect(dropzone.className).toContain("border-navy"));

    dropzone.dispatchEvent(new Event("dragleave", { bubbles: true, cancelable: true }));
    await waitFor(() => expect(dropzone.className).not.toContain("bg-navy-dim"));
  });

  it("opens the file picker when the dropzone is clicked", async () => {
    const user = userEvent.setup();
    render(<ImportCsvModal open={true} onOpenChange={vi.fn()} onImported={vi.fn()} />);

    const dropzone = screen.getByText("Arraste um arquivo .csv aqui").closest("div")!;
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, "click");
    await user.click(dropzone);
    expect(clickSpy).toHaveBeenCalled();
  });

  it("allows remapping a column and going back to the upload step", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: preview });

    render(<ImportCsvModal open={true} onOpenChange={vi.fn()} onImported={vi.fn()} />);
    const file = new File(["x"], "pessoas.csv", { type: "text/csv" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);
    await screen.findByText("pessoas.csv");

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "email");
    expect((selects[0] as HTMLSelectElement).value).toBe("email");

    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.getByText("Arraste um arquivo .csv aqui")).toBeInTheDocument();
  });

  it("defaults a column with no suggested mapping to the ignore option", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({
      data: {
        detected_columns: ["nome", "observacao"],
        preview_rows: [{ nome: "Ana", observacao: "vip" }],
        suggested_mapping: { nome: "nome" },
      },
    });

    render(<ImportCsvModal open={true} onOpenChange={vi.fn()} onImported={vi.fn()} />);
    const file = new File(["x"], "pessoas.csv", { type: "text/csv" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);
    await screen.findByText("pessoas.csv");

    const selects = screen.getAllByRole("combobox");
    expect((selects[1] as HTMLSelectElement).value).toBe("");
  });

  it("does nothing when the file input change fires without a file", () => {
    render(<ImportCsvModal open={true} onOpenChange={vi.fn()} onImported={vi.fn()} />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, "files", { value: [], configurable: true });
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));

    expect(api.post).not.toHaveBeenCalled();
  });

  it("truncates the error list and shows how many more there are", async () => {
    const user = userEvent.setup();
    const errors = Array.from({ length: 7 }, (_, i) => ({ row: i + 2, reason: "missing_name" }));
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === "/persons/import") return Promise.resolve({ data: preview });
      if (url === "/persons/import/confirm")
        return Promise.resolve({ data: { imported: 0, skipped: 7, errors } });
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });

    render(<ImportCsvModal open={true} onOpenChange={vi.fn()} onImported={vi.fn()} />);
    const file = new File(["x"], "pessoas.csv", { type: "text/csv" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);
    await screen.findByText("pessoas.csv");
    await user.click(screen.getByRole("button", { name: "Importar" }));

    expect(await screen.findByText("7 erro(s)")).toBeInTheDocument();
    expect(screen.getByText("…e mais 2")).toBeInTheDocument();
    expect(screen.queryByText("Linha 7: sem nome")).not.toBeInTheDocument();
  });

  it("resets and notifies parent when closed via the modal's close control", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ImportCsvModal open={true} onOpenChange={onOpenChange} onImported={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
