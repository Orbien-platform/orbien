import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KidsLabels } from "@/lib/kids";
import { PrintLabels } from "./PrintLabels";

const LABELS: KidsLabels = {
  checkin_id: "c1",
  child_label: { child_name: "Davi Souza", room_name: "Maternal", has_allergy: true, allergy: "amendoim", code: "A2B3" },
  guardian_label: { child_name: "Davi Souza", room_name: "Maternal", code: "A2B3" },
};

describe("PrintLabels", () => {
  beforeEach(() => {
    window.print = vi.fn();
  });
  it("abre a impressão uma vez e avisa ao terminar (afterprint)", () => {
    const onDone = vi.fn();
    const { rerender } = render(<PrintLabels labels={LABELS} onDone={onDone} />);
    expect(window.print).toHaveBeenCalledTimes(1);
    // Um onDone novo a cada render não imprime de novo.
    rerender(<PrintLabels labels={LABELS} onDone={onDone} />);
    expect(window.print).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event("afterprint"));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("monta as duas etiquetas, 62×29 mm, com alergia em texto e o mesmo código nas duas", () => {
    render(<PrintLabels labels={LABELS} onDone={vi.fn()} />);
    const sheet = document.querySelector(".kids-label-sheet")!;
    expect(sheet.parentElement).toBe(document.body);
    expect(sheet.querySelectorAll(".kids-label")).toHaveLength(2);
    expect(sheet.querySelectorAll(".kids-label-code")[0]).toHaveTextContent("A2B3");
    expect(sheet.querySelectorAll(".kids-label-code")[1]).toHaveTextContent("A2B3");
    expect(screen.getByText(/Alergia: amendoim/, { ignore: "style" })).toBeInTheDocument();
    expect(screen.getByText("Responsável de Davi Souza", { ignore: "style" })).toBeInTheDocument();
    expect(sheet.querySelector("style")!.textContent).toContain("@page { size: 62mm 29mm");
  });

  it("sem alergia a etiqueta da criança não leva a faixa", () => {
    render(
      <PrintLabels
        labels={{ ...LABELS, child_label: { ...LABELS.child_label, has_allergy: false, allergy: null } }}
        onDone={vi.fn()}
      />,
    );
    expect(document.querySelector(".kids-label-allergy")).toBeNull();
  });

  it("desmontar tira o ouvinte: afterprint depois não chama onDone", () => {
    const onDone = vi.fn();
    const { unmount } = render(<PrintLabels labels={LABELS} onDone={onDone} />);
    unmount();
    window.dispatchEvent(new Event("afterprint"));
    expect(onDone).not.toHaveBeenCalled();
  });
});
