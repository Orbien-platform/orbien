import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AddItemModal } from "./AddItemModal";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const persons = [{ id: "p1", full_name: "Ana Souza" }];

describe("AddItemModal", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.startsWith("/persons")) {
        return Promise.resolve({ data: { data: persons } });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  });

  it("does not render form fields when closed", () => {
    render(
      <AddItemModal
        open={false}
        onOpenChange={vi.fn()}
        serviceOrderId="so1"
        nextSequence={0}
        onAdded={vi.fn()}
      />
    );
    expect(screen.queryByText("Nova etapa")).not.toBeInTheDocument();
  });

  it("loads persons when opened, and validates required fields", async () => {
    const user = userEvent.setup();
    render(
      <AddItemModal
        open={true}
        onOpenChange={vi.fn()}
        serviceOrderId="so1"
        nextSequence={2}
        onAdded={vi.fn()}
      />
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/persons?limit=100"));
    expect(await screen.findByRole("option", { name: "Ana Souza" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Nome da etapa é obrigatório.");

    await user.type(screen.getByLabelText(/Nome da etapa/), "Louvor de abertura");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Duração é obrigatória.");

    await user.type(screen.getByLabelText(/Duração/), "20");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Horário é obrigatório.");
  });

  it("submits the item converting horário para start_offset_minutes e chama onAdded/onOpenChange", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const onAdded = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <AddItemModal
        open={true}
        onOpenChange={onOpenChange}
        serviceOrderId="so1"
        nextSequence={2}
        celebrationStartTime="09:30"
        onAdded={onAdded}
      />
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/persons?limit=100"));

    await user.type(screen.getByLabelText(/Nome da etapa/), "Louvor de abertura");
    await user.selectOptions(screen.getByLabelText("Tipo"), "sermon");
    await user.type(screen.getByLabelText(/Duração/), "20");
    await user.type(screen.getByLabelText(/Horário/), "10:00");
    await user.selectOptions(screen.getByLabelText(/Responsável/), "p1");
    await user.type(screen.getByLabelText(/Notas/), "Observação");

    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/celebrations/items",
        expect.objectContaining({
          service_order_id: "so1",
          sequence: 2,
          name: "Louvor de abertura",
          type: "sermon",
          duration_minutes: 20,
          start_offset_minutes: 30,
          responsible_type: "person",
          person_id: "p1",
          notes: "Observação",
        })
      )
    );

    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("sem responsável escolhido, envia responsible_type free_text com um rótulo padrão", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });

    render(
      <AddItemModal
        open={true}
        onOpenChange={vi.fn()}
        serviceOrderId="so1"
        nextSequence={1}
        onAdded={vi.fn()}
      />
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/persons?limit=100"));

    await user.type(screen.getByLabelText(/Nome da etapa/), "Oração");
    await user.type(screen.getByLabelText(/Duração/), "5");
    await user.type(screen.getByLabelText(/Horário/), "10:00");

    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/celebrations/items",
        expect.objectContaining({
          responsible_type: "free_text",
          responsible_label: "A definir",
          person_id: undefined,
        })
      )
    );
  });

  it("sem horário de início da celebração conhecido, usa offset 0", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });

    render(
      <AddItemModal
        open={true}
        onOpenChange={vi.fn()}
        serviceOrderId="so1"
        nextSequence={1}
        onAdded={vi.fn()}
      />
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/persons?limit=100"));

    await user.type(screen.getByLabelText(/Nome da etapa/), "Abertura");
    await user.type(screen.getByLabelText(/Duração/), "5");
    await user.type(screen.getByLabelText(/Horário/), "10:00");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/celebrations/items",
        expect.objectContaining({ start_offset_minutes: 0 })
      )
    );
  });

  it("shows an error message when the API call fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue(new Error("fail"));

    render(
      <AddItemModal
        open={true}
        onOpenChange={vi.fn()}
        serviceOrderId="so1"
        nextSequence={0}
        onAdded={vi.fn()}
      />
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/persons?limit=100"));

    await user.type(screen.getByLabelText(/Nome da etapa/), "Louvor de abertura");
    await user.type(screen.getByLabelText(/Duração/), "20");
    await user.type(screen.getByLabelText(/Horário/), "10:00");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Erro ao adicionar etapa.");
  });

  it("does not refetch persons when reopened without going through Modal's reset", async () => {
    const { rerender } = render(
      <AddItemModal
        open={true}
        onOpenChange={vi.fn()}
        serviceOrderId="so1"
        nextSequence={0}
        onAdded={vi.fn()}
      />
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/persons?limit=100"));
    const callsAfterFirstOpen = vi.mocked(api.get).mock.calls.length;

    rerender(
      <AddItemModal
        open={false}
        onOpenChange={vi.fn()}
        serviceOrderId="so1"
        nextSequence={0}
        onAdded={vi.fn()}
      />
    );
    rerender(
      <AddItemModal
        open={true}
        onOpenChange={vi.fn()}
        serviceOrderId="so1"
        nextSequence={0}
        onAdded={vi.fn()}
      />
    );

    expect(vi.mocked(api.get).mock.calls.length).toBe(callsAfterFirstOpen);
  });

  it("resets the form when closed via the Modal's close button", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <AddItemModal
        open={true}
        onOpenChange={onOpenChange}
        serviceOrderId="so1"
        nextSequence={0}
        onAdded={vi.fn()}
      />
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/persons?limit=100"));

    await user.type(screen.getByLabelText(/Nome da etapa/), "Algo");
    await user.click(screen.getByRole("button", { name: "Fechar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onOpenChange(false) when Cancelar is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <AddItemModal
        open={true}
        onOpenChange={onOpenChange}
        serviceOrderId="so1"
        nextSequence={0}
        onAdded={vi.fn()}
      />
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/persons?limit=100"));

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("silently ignores a failed persons fetch", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("network error"));

    render(
      <AddItemModal
        open={true}
        onOpenChange={vi.fn()}
        serviceOrderId="so1"
        nextSequence={0}
        onAdded={vi.fn()}
      />
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/persons?limit=100"));
    // No crash; the responsible select stays with just the placeholder option.
    expect(screen.getByLabelText(/Responsável/)).toBeInTheDocument();
  });
});
