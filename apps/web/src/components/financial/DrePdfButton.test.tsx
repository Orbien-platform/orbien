import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DrePdfButton } from "./DrePdfButton";
import { DrePanel } from "./DrePanel";
import type { DreModel } from "./useDreReport";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
  isForbidden: () => false,
}));

let downloads: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  downloads = [];
  URL.createObjectURL = vi.fn(() => "blob:fake");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });
});

afterEach(() => vi.restoreAllMocks());

describe("DrePdfButton", () => {
  it("envia período e centro no corpo e baixa orbien_dre_AAAAMM.pdf", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: new Blob(["%PDF"]) });
    render(<DrePdfButton periodStart="2026-09-01" periodEnd="2026-09-30" costCenterId="cc1" />);

    fireEvent.click(screen.getByRole("button", { name: /DRE \(PDF\)/ }));

    await waitFor(() => expect(downloads).toEqual(["orbien_dre_202609.pdf"]));
    expect(api.post).toHaveBeenCalledWith(
      "/financial/dre/export/pdf",
      { period_start: "2026-09-01", period_end: "2026-09-30", cost_center_id: "cc1" },
      { responseType: "blob" },
    );
  });

  it("período em meses diferentes: nome com os dois meses", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: new Blob(["%PDF"]) });
    render(<DrePdfButton periodStart="2026-07-01" periodEnd="2026-09-30" costCenterId="" />);

    fireEvent.click(screen.getByRole("button", { name: /DRE \(PDF\)/ }));

    await waitFor(() => expect(downloads).toEqual(["orbien_dre_202607_202609.pdf"]));
  });

  it("'Todos os centros' não manda cost_center_id", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: new Blob(["%PDF"]) });
    render(<DrePdfButton periodStart="2026-09-01" periodEnd="2026-09-30" costCenterId="" />);

    fireEvent.click(screen.getByRole("button", { name: /DRE \(PDF\)/ }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(vi.mocked(api.post).mock.calls[0][1]).toEqual({ period_start: "2026-09-01", period_end: "2026-09-30" });
  });

  it("'Lançamentos sem centro' manda cost_center_id=none", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: new Blob(["%PDF"]) });
    render(<DrePdfButton periodStart="2026-09-01" periodEnd="2026-09-30" costCenterId="none" />);

    fireEvent.click(screen.getByRole("button", { name: /DRE \(PDF\)/ }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(vi.mocked(api.post).mock.calls[0][1]).toMatchObject({ cost_center_id: "none" });
  });

  it("período vazio: pede o período e não chama a API", () => {
    render(<DrePdfButton periodStart="" periodEnd="2026-09-30" costCenterId="" />);

    fireEvent.click(screen.getByRole("button", { name: /DRE \(PDF\)/ }));

    expect(screen.getByText("Selecione o período antes de exportar.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("falha: mostra 'Erro ao exportar o DRE.', não baixa nada e reabilita o botão", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("boom"));
    render(<DrePdfButton periodStart="2026-09-01" periodEnd="2026-09-30" costCenterId="" />);

    fireEvent.click(screen.getByRole("button", { name: /DRE \(PDF\)/ }));

    expect(await screen.findByText("Erro ao exportar o DRE.")).toBeInTheDocument();
    expect(downloads).toEqual([]);
    expect(screen.getByRole("button", { name: /DRE \(PDF\)/ })).toBeEnabled();
  });

  it("desabilita o botão enquanto o PDF é gerado", async () => {
    let resolve!: (v: unknown) => void;
    vi.mocked(api.post).mockReturnValue(new Promise((r) => (resolve = r)) as never);
    render(<DrePdfButton periodStart="2026-09-01" periodEnd="2026-09-30" costCenterId="" />);

    fireEvent.click(screen.getByRole("button", { name: /DRE \(PDF\)/ }));

    expect(screen.getByRole("button", { name: /DRE \(PDF\)/ })).toBeDisabled();
    resolve({ data: new Blob(["%PDF"]) });
    await waitFor(() => expect(screen.getByRole("button", { name: /DRE \(PDF\)/ })).toBeEnabled());
  });
});

function model(over: Partial<DreModel> = {}): DreModel {
  return {
    start: "2026-09-01",
    end: "2026-09-30",
    costCenterId: "",
    costCenters: [],
    dre: null,
    loading: false,
    accessDenied: false,
    matrix: null,
    matrixLoading: false,
    matrixDenied: false,
    setStart: vi.fn(),
    setEnd: vi.fn(),
    setCostCenterId: vi.fn(),
    ...over,
  };
}

describe("DrePanel — botão do PDF", () => {
  it("aparece para quem gerencia o financeiro, com o centro escolhido", () => {
    render(<DrePanel model={model({ costCenterId: "cc1" })} isPastor={false} />);
    expect(screen.getByRole("button", { name: /DRE \(PDF\)/ })).toBeInTheDocument();
  });

  it("pastor sem outro papel: o botão não aparece", () => {
    render(<DrePanel model={model()} isPastor />);
    expect(screen.queryByRole("button", { name: /DRE \(PDF\)/ })).not.toBeInTheDocument();
  });
});
