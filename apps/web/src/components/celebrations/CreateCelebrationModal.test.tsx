import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { CreateCelebrationModal } from "./CreateCelebrationModal";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { post: vi.fn() },
}));

describe("CreateCelebrationModal", () => {
  it("does not render form fields when closed", () => {
    render(
      <CreateCelebrationModal open={false} onOpenChange={vi.fn()} onCreated={vi.fn()} />
    );
    expect(screen.queryByText("Nova celebração")).not.toBeInTheDocument();
  });

  it("validates required fields (name and start time)", async () => {
    const user = userEvent.setup();
    render(
      <CreateCelebrationModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Criar celebração" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nome é obrigatório.");

    await user.type(screen.getByLabelText(/Nome/), "Culto Dominical Manhã");
    await user.click(screen.getByRole("button", { name: "Criar celebração" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Horário é obrigatório.");

    expect(api.post).not.toHaveBeenCalled();
  });

  it("submits the celebration and shows success, then calls onCreated/onOpenChange", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <CreateCelebrationModal open={true} onOpenChange={onOpenChange} onCreated={onCreated} />
    );

    await user.type(screen.getByLabelText(/Nome/), "Culto Dominical Manhã");
    await user.selectOptions(screen.getByLabelText(/Tipo/), "midweek");
    await user.selectOptions(screen.getByLabelText(/Dia da semana/), "3");
    await user.type(screen.getByLabelText(/Horário/), "19:30");
    await user.selectOptions(screen.getByLabelText(/Recorrência/), "monthly");

    await user.click(screen.getByRole("button", { name: "Criar celebração" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/celebrations",
        expect.objectContaining({
          name: "Culto Dominical Manhã",
          type: "midweek",
          day_of_week: 3,
          start_time: "19:30",
          recurrence: "monthly",
        })
      )
    );

    expect(await screen.findByText("Celebração criada com sucesso!")).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(1200);

    expect(onCreated).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    vi.useRealTimers();
  });

  it("shows an error message when the API call fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue(new Error("fail"));

    render(
      <CreateCelebrationModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />
    );

    await user.type(screen.getByLabelText(/Nome/), "Culto Dominical Manhã");
    await user.type(screen.getByLabelText(/Horário/), "19:30");
    await user.click(screen.getByRole("button", { name: "Criar celebração" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Erro ao criar celebração. Tente novamente."
    );
  });

  it("resets the form when closed via the Modal's close button", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <CreateCelebrationModal open={true} onOpenChange={onOpenChange} onCreated={vi.fn()} />
    );

    await user.type(screen.getByLabelText(/Nome/), "Algo");
    await user.click(screen.getByRole("button", { name: "Fechar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onOpenChange(false) when Cancelar is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <CreateCelebrationModal open={true} onOpenChange={onOpenChange} onCreated={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
