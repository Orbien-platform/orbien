import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CelebrationDetailSheet } from "./CelebrationDetailSheet";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const celebration = {
  id: "c1",
  name: "Culto Domingo",
  type: "sunday_service",
  day_of_week: 0,
  start_time: "10:00",
  recurrence: "weekly",
};

const instances = [
  { id: "i1", scheduled_date: "2026-09-06T10:00:00.000Z", status: "scheduled", serviceOrder: { id: "so1" } },
  { id: "i2", scheduled_date: "2026-09-13T10:00:00.000Z", status: "scheduled", serviceOrder: null },
];

function mockGet() {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url === "/celebrations/c1") return Promise.resolve({ data: celebration });
    if (url === "/celebrations/instances?celebration_id=c1") {
      return Promise.resolve({ data: instances });
    }
    if (url === "/celebrations/instances/i1") {
      return Promise.resolve({ data: { id: "i1", date: instances[0].scheduled_date, celebration: { id: "c1", name: celebration.name, time: "10:00" } } });
    }
    if (url === "/celebrations/instances/i1/service-order") {
      return Promise.reject({ response: { status: 404 } });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

describe("CelebrationDetailSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render content when closed", () => {
    mockGet();
    render(
      <CelebrationDetailSheet
        open={false}
        onOpenChange={vi.fn()}
        celebrationId="c1"
        canEdit={true}
        canAddSongs={true}
      />
    );
    expect(screen.queryByText("Culto Domingo")).not.toBeInTheDocument();
  });

  it("loads celebration details and lists instances", async () => {
    mockGet();
    render(
      <CelebrationDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        celebrationId="c1"
        canEdit={true}
        canAddSongs={true}
      />
    );

    expect(await screen.findByText("Culto Domingo")).toBeInTheDocument();
    expect(screen.getByText("Instâncias (2)")).toBeInTheDocument();
    expect(screen.getByText("Com OC")).toBeInTheDocument();
    expect(screen.getByText("Sem OC")).toBeInTheDocument();
  });

  it("shows an empty state when there are no instances", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/c1") return Promise.resolve({ data: celebration });
      if (url === "/celebrations/instances?celebration_id=c1") {
        return Promise.resolve({ data: [] });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    render(
      <CelebrationDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        celebrationId="c1"
        canEdit={true}
        canAddSongs={true}
      />
    );
    expect(await screen.findByText("Nenhuma instância gerada.")).toBeInTheDocument();
  });

  it("opens the service order view when an instance is clicked", async () => {
    mockGet();
    const user = userEvent.setup();
    render(
      <CelebrationDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        celebrationId="c1"
        canEdit={true}
        canAddSongs={true}
      />
    );

    await screen.findByText("Instâncias (2)");
    await user.click(screen.getByText("Com OC").closest("button")!);

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/celebrations/instances/i1")
    );
  });

  it("clears instances when the instances request fails", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/c1") return Promise.resolve({ data: celebration });
      if (url === "/celebrations/instances?celebration_id=c1") {
        return Promise.reject(new Error("boom"));
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    render(
      <CelebrationDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        celebrationId="c1"
        canEdit={true}
        canAddSongs={true}
      />
    );
    expect(await screen.findByText("Nenhuma instância gerada.")).toBeInTheDocument();
  });

  it("ignores a stale response after the celebration changes before it resolves", async () => {
    let resolveFirst!: (v: { data: typeof celebration }) => void;
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/c1") {
        return new Promise((resolve) => { resolveFirst = resolve; });
      }
      if (url === "/celebrations/c2") return Promise.resolve({ data: { ...celebration, id: "c2", name: "Culto Noite" } });
      if (url.startsWith("/celebrations/instances")) return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    const { rerender } = render(
      <CelebrationDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        celebrationId="c1"
        canEdit={true}
        canAddSongs={true}
      />
    );

    rerender(
      <CelebrationDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        celebrationId="c2"
        canEdit={true}
        canAddSongs={true}
      />
    );

    expect(await screen.findByText("Culto Noite")).toBeInTheDocument();

    // Resolve the stale (cancelled) request for c1 after c2 already loaded —
    // it must not overwrite the currently displayed celebration.
    resolveFirst({ data: celebration });
    await Promise.resolve();
    expect(screen.getByText("Culto Noite")).toBeInTheDocument();
  });

  it("resets state when the sheet is closed via its close button", async () => {
    mockGet();
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <CelebrationDetailSheet
        open={true}
        onOpenChange={onOpenChange}
        celebrationId="c1"
        canEdit={true}
        canAddSongs={true}
      />
    );

    expect(await screen.findByText("Culto Domingo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Voltar/ }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps loading state when the celebration request fails", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/c1") return Promise.reject(new Error("boom"));
      if (url === "/celebrations/instances?celebration_id=c1") return Promise.resolve({ data: instances });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    render(
      <CelebrationDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        celebrationId="c1"
        canEdit={true}
        canAddSongs={true}
      />
    );
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/celebrations/instances?celebration_id=c1"));
    expect(screen.queryByText("Culto Domingo")).not.toBeInTheDocument();
  });

  it("defaults instances to an empty list when the response has no data field", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/c1") return Promise.resolve({ data: celebration });
      if (url === "/celebrations/instances?celebration_id=c1") return Promise.resolve({ data: undefined });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    render(
      <CelebrationDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        celebrationId="c1"
        canEdit={true}
        canAddSongs={true}
      />
    );
    expect(await screen.findByText("Nenhuma instância gerada.")).toBeInTheDocument();
  });

  it("shows no recurrence/day/time badges when the celebration lacks them, and falls back to the raw type", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/c1") {
        return Promise.resolve({
          data: { id: "c1", name: "Reunião Especial", type: "custom_type", day_of_week: null, start_time: "", recurrence: "custom_recurrence" },
        });
      }
      if (url === "/celebrations/instances?celebration_id=c1") return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    render(
      <CelebrationDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        celebrationId="c1"
        canEdit={true}
        canAddSongs={true}
      />
    );
    expect(await screen.findByText("Reunião Especial")).toBeInTheDocument();
    expect(screen.getByText("custom_type")).toBeInTheDocument();
    expect(screen.getByText("custom_recurrence")).toBeInTheDocument();
  });

  describe("cancelar e remover", () => {
    function renderSheet(props: Partial<React.ComponentProps<typeof CelebrationDetailSheet>> = {}) {
      return render(
        <CelebrationDetailSheet
          open={true}
          onOpenChange={vi.fn()}
          celebrationId="c1"
          canEdit={true}
          canRemove={true}
          canAddSongs={true}
          {...props}
        />
      );
    }

    it("cancela um culto depois de confirmar e recarrega a lista", async () => {
      mockGet();
      vi.mocked(api.patch).mockResolvedValue({ data: {} });
      const user = userEvent.setup();
      renderSheet();

      await screen.findByText("Instâncias (2)");
      await user.click(screen.getAllByRole("button", { name: /^Cancelar o culto de/ })[0]);
      await user.click(await screen.findByRole("button", { name: "Cancelar culto" }));

      await waitFor(() =>
        expect(api.patch).toHaveBeenCalledWith("/celebrations/instances/i2", { status: "cancelled" })
      );
      await waitFor(() =>
        expect(vi.mocked(api.get).mock.calls.filter(([u]) => u === "/celebrations/instances?celebration_id=c1")).toHaveLength(2)
      );
    });

    it("reabre um culto cancelado sem pedir confirmação", async () => {
      vi.mocked(api.get).mockImplementation((url: string) => {
        if (url === "/celebrations/c1") return Promise.resolve({ data: celebration });
        return Promise.resolve({ data: [{ id: "i1", scheduled_date: "2026-09-06T00:00:00.000Z", status: "cancelled" }] });
      });
      vi.mocked(api.patch).mockResolvedValue({ data: {} });
      const user = userEvent.setup();
      renderSheet();

      await screen.findByText("Instâncias (1)");
      expect(screen.getByText("Cancelado", { selector: "span.rounded-full" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /^Reabrir o culto de/ }));

      await waitFor(() =>
        expect(api.patch).toHaveBeenCalledWith("/celebrations/instances/i1", { status: "draft" })
      );
    });

    it("cancela uma data pontual de uma recorrente e mostra o erro do servidor", async () => {
      mockGet();
      vi.mocked(api.post).mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 400, data: { message: "2026-12-28 não cai no dia da semana desta celebração" } },
      });
      vi.mocked(api.post).mockResolvedValueOnce({ data: [] });
      const user = userEvent.setup();
      renderSheet();

      await screen.findByText("Instâncias (2)");
      await user.click(screen.getByRole("button", { name: /Cancelar uma data/ }));
      const submit = await screen.findByRole("button", { name: "Cancelar data" });
      expect(submit).toBeDisabled();
      await user.type(screen.getByLabelText("Data"), "2026-12-28");
      await user.click(submit);
      expect(await screen.findByText(/não cai no dia da semana/)).toBeInTheDocument();

      await user.clear(screen.getByLabelText("Data"));
      await user.type(screen.getByLabelText("Data"), "2026-12-27");
      await user.click(screen.getByRole("button", { name: "Cancelar data" }));
      await waitFor(() =>
        expect(api.post).toHaveBeenLastCalledWith("/celebrations/c1/instances/cancel", { dates: ["2026-12-27"] })
      );
    });

    it("remove a celebração, fecha o detalhe e avisa a página", async () => {
      mockGet();
      vi.mocked(api.delete).mockResolvedValue({ data: {} });
      const onRemoved = vi.fn();
      const onOpenChange = vi.fn();
      const user = userEvent.setup();
      renderSheet({ onRemoved, onOpenChange });

      await screen.findByText("Instâncias (2)");
      await user.click(screen.getByRole("button", { name: /Remover celebração/ }));
      expect(await screen.findByText(/deixa de se repetir/)).toBeInTheDocument();
      await user.click(screen.getAllByRole("button", { name: "Remover celebração" }).at(-1)!);

      await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/celebrations/c1"));
      await waitFor(() => expect(onRemoved).toHaveBeenCalled());
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("esconde as ações de quem não pode editar nem remover", async () => {
      mockGet();
      renderSheet({ canEdit: false, canRemove: false });

      await screen.findByText("Instâncias (2)");
      expect(screen.queryByRole("button", { name: /Remover celebração/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Cancelar uma data/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Cancelar o culto de/ })).not.toBeInTheDocument();
    });
  });
});
