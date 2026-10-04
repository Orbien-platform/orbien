import { render, screen, waitFor } from "@testing-library/react";
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

  it("mostra Buscando… enquanto a resposta não chega e aceita resposta sem lista", async () => {
    let resolve!: (v: unknown) => void;
    vi.mocked(api.get).mockReturnValue(new Promise((r) => { resolve = r; }) as never);
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByPlaceholderText("Buscar pessoa pelo nome"), "Zé");

    expect(await screen.findByText("Buscando…")).toBeInTheDocument();
    resolve({ data: {} });
    expect(await screen.findByText(/precisa estar cadastrada em Pessoas/)).toBeInTheDocument();
  });

  it("descarta a resposta de uma busca antiga que chega depois da nova", async () => {
    let resolveOld!: (v: unknown) => void;
    vi.mocked(api.get)
      .mockReturnValueOnce(new Promise((r) => { resolveOld = r; }) as never)
      .mockResolvedValueOnce({ data: { data: [{ id: "p2", full_name: "Mariana Dias" }] } });
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByPlaceholderText("Buscar pessoa pelo nome");

    await user.type(input, "Ma");
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    await user.type(input, "r");
    expect(await screen.findByRole("button", { name: "Mariana Dias" })).toBeInTheDocument();

    resolveOld({ data: { data: [{ id: "p1", full_name: "Maria Antiga" }] } });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("Maria Antiga")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mariana Dias" })).toBeInTheDocument();
  });

  it("descarta o erro de uma busca antiga que falha depois da nova", async () => {
    let rejectOld!: (e: unknown) => void;
    vi.mocked(api.get)
      .mockReturnValueOnce(new Promise((_, r) => { rejectOld = r; }) as never)
      .mockResolvedValueOnce({ data: { data: [{ id: "p2", full_name: "Mariana Dias" }] } });
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByPlaceholderText("Buscar pessoa pelo nome");

    await user.type(input, "Ma");
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    await user.type(input, "r");
    await screen.findByRole("button", { name: "Mariana Dias" });

    rejectOld(new Error("tarde"));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
