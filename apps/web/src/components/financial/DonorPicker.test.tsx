import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DonorPicker, type DonorOption } from "./DonorPicker";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

function Harness({ onChange }: { onChange?: (d: DonorOption | null) => void }) {
  const [value, setValue] = useState<DonorOption | null>(null);
  return (
    <DonorPicker
      value={value}
      onChange={(d) => {
        setValue(d);
        onChange?.(d);
      }}
    />
  );
}

describe("DonorPicker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("busca por nome e seleciona a pessoa", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [{ id: "p1", full_name: "Maria Souza" }] } });
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);

    await user.type(screen.getByPlaceholderText("Buscar pessoa pelo nome"), "Mar");
    await user.click(await screen.findByRole("button", { name: "Maria Souza" }));

    expect(api.get).toHaveBeenCalledWith("/persons?search=Mar&limit=8");
    expect(onChange).toHaveBeenCalledWith({ id: "p1", full_name: "Maria Souza" });
    expect(screen.getByText("Maria Souza")).toBeInTheDocument();
  });

  it("não busca com menos de 2 letras", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByPlaceholderText("Buscar pessoa pelo nome"), "M");
    await new Promise((r) => setTimeout(r, 400));
    expect(api.get).not.toHaveBeenCalled();
  });

  it("orienta quando ninguém é encontrado", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [] } });
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByPlaceholderText("Buscar pessoa pelo nome"), "Zé");
    expect(await screen.findByText(/precisa estar cadastrada em Pessoas/)).toBeInTheDocument();
  });

  it("mostra erro de busca", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("x"));
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByPlaceholderText("Buscar pessoa pelo nome"), "Zé");
    expect(await screen.findByRole("alert")).toHaveTextContent("Erro na busca");
  });

  it("permite trocar o doador escolhido", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [{ id: "p1", full_name: "Maria Souza" }] } });
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    await user.type(screen.getByPlaceholderText("Buscar pessoa pelo nome"), "Mar");
    await user.click(await screen.findByRole("button", { name: "Maria Souza" }));
    await user.click(screen.getByRole("button", { name: "Trocar doador" }));

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByPlaceholderText("Buscar pessoa pelo nome")).toBeInTheDocument();
  });
});
