import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AttendanceFormModal } from "./AttendanceFormModal";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({ default: { put: vi.fn() } }));

function setup(initial = null as null | { children: number; members: number; attendees: number; visitors: number; total: number }) {
  const onSaved = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <AttendanceFormModal
      open
      onOpenChange={onOpenChange}
      instanceId="i1"
      subtitle="Culto de domingo"
      initial={initial}
      onSaved={onSaved}
    />,
  );
  return { onSaved, onOpenChange };
}

async function fill(user: ReturnType<typeof userEvent.setup>, v: [string, string, string, string]) {
  await user.type(screen.getByLabelText("Crianças"), v[0]);
  await user.type(screen.getByLabelText("Membros"), v[1]);
  await user.type(screen.getByLabelText("Frequentadores"), v[2]);
  await user.type(screen.getByLabelText("Visitantes"), v[3]);
}

describe("AttendanceFormModal", () => {
  // Com chaves: `mockReset()` devolve o mock, e o Vitest o chamaria como limpeza.
  beforeEach(() => {
    vi.mocked(api.put).mockReset();
  });

  it("soma o total ao vivo e só habilita salvar com as quatro categorias válidas", async () => {
    const user = userEvent.setup();
    setup();
    const save = screen.getByRole("button", { name: "Salvar contagem" });
    expect(save).toBeDisabled();

    await fill(user, ["10", "50", "8", "4"]);

    expect(screen.getByTestId("attendance-total")).toHaveTextContent("72");
    expect(save).toBeEnabled();
  });

  it("aceita zero como valor e rejeita número fracionado ou acima do limite", async () => {
    const user = userEvent.setup();
    setup();
    await fill(user, ["0", "0", "0", "1,5"]);
    expect(screen.getByRole("button", { name: "Salvar contagem" })).toBeDisabled();
    expect(screen.getByText(/números inteiros de 0 a 100\.000/)).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Visitantes"));
    await user.type(screen.getByLabelText("Visitantes"), "0");
    expect(screen.getByRole("button", { name: "Salvar contagem" })).toBeEnabled();

    await user.clear(screen.getByLabelText("Membros"));
    await user.type(screen.getByLabelText("Membros"), "100001");
    expect(screen.getByRole("button", { name: "Salvar contagem" })).toBeDisabled();
  });

  it("começa com a contagem já lançada", () => {
    setup({ children: 1, members: 2, attendees: 3, visitors: 4, total: 10 });
    expect(screen.getByLabelText("Membros")).toHaveValue("2");
    expect(screen.getByTestId("attendance-total")).toHaveTextContent("10");
  });

  it("salva com PUT, avisa quem abriu e fecha", async () => {
    const user = userEvent.setup();
    const { onSaved, onOpenChange } = setup();
    const saved = { children: 10, members: 50, attendees: 8, visitors: 4, total: 72 };
    vi.mocked(api.put).mockResolvedValue({ data: saved });

    await fill(user, ["10", "50", "8", "4"]);
    await user.click(screen.getByRole("button", { name: "Salvar contagem" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(api.put).toHaveBeenCalledWith("/celebrations/instances/i1/attendance", {
      children: 10,
      members: 50,
      attendees: 8,
      visitors: 4,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("mostra a mensagem da API quando ela recusa (ex.: antes do dia do culto)", async () => {
    const user = userEvent.setup();
    vi.mocked(api.put).mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { message: "A contagem só pode ser lançada a partir do dia do culto" } },
    });
    const { onSaved } = setup();

    await fill(user, ["1", "1", "1", "1"]);
    await user.click(screen.getByRole("button", { name: "Salvar contagem" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("a partir do dia do culto");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("usa a mensagem padrão quando o erro não vem da API", async () => {
    const user = userEvent.setup();
    vi.mocked(api.put).mockRejectedValue(new Error("rede"));
    setup();
    await fill(user, ["1", "1", "1", "1"]);
    await user.click(screen.getByRole("button", { name: "Salvar contagem" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível salvar a contagem.");
  });

  it("Voltar fecha sem salvar", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = setup();
    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(api.put).not.toHaveBeenCalled();
  });
});
