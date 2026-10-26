import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CelebrationDetailSheet } from "./CelebrationDetailSheet";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

// Os dois componentes do Kids têm testes próprios; aqui só interessa a fiação.
vi.mock("@/components/kids/KidsTemplateSection", () => ({
  KidsTemplateSection: ({ celebrationId }: { celebrationId: string }) => (
    <div data-testid="kids-template">modelo:{celebrationId}</div>
  ),
}));
vi.mock("@/components/kids/KidsSessionsModal", () => ({
  KidsSessionsModal: ({
    instanceId,
    subtitle,
    onOpenChange,
  }: {
    instanceId: string;
    subtitle: string;
    onOpenChange: (open: boolean) => void;
  }) => (
    <div data-testid="kids-sessions">
      sessões:{instanceId}:{subtitle}
      <button onClick={() => onOpenChange(false)}>fechar kids</button>
    </div>
  ),
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

  describe("contagem de público", () => {
    function renderSheet(canEdit = true) {
      return render(
        <CelebrationDetailSheet
          open={true}
          onOpenChange={vi.fn()}
          celebrationId="c1"
          canEdit={canEdit}
          canAddSongs={true}
        />
      );
    }

    it("mostra o total lançado, 'Contar' no culto sem contagem, e salva pelo formulário", async () => {
      vi.mocked(api.get).mockImplementation((url: string) => {
        if (url === "/celebrations/c1") return Promise.resolve({ data: celebration });
        return Promise.resolve({
          data: [
            { id: "i1", scheduled_date: "2026-09-06T00:00:00.000Z", status: "scheduled", attendance: { children: 1, members: 2, attendees: 3, visitors: 4 } },
            { id: "i2", scheduled_date: "2026-09-13T00:00:00.000Z", status: "scheduled", attendance: null },
            { id: "i3", scheduled_date: "2026-09-20T00:00:00.000Z", status: "cancelled" },
          ],
        });
      });
      vi.mocked(api.put).mockResolvedValue({ data: { children: 0, members: 5, attendees: 0, visitors: 0, total: 5 } });
      const user = userEvent.setup();
      renderSheet();

      await screen.findByText("Instâncias (3)");
      const buttons = screen.getAllByRole("button", { name: /^Contagem de público do culto de/ });
      // O culto cancelado não tem contagem.
      expect(buttons).toHaveLength(2);
      // Do mais novo para o mais antigo: i2 ainda sem contagem, i1 com 10.
      expect(buttons[0]).toHaveTextContent("Contar");
      expect(buttons[1]).toHaveTextContent("10");

      await user.click(buttons[0]);
      await user.type(await screen.findByLabelText("Crianças"), "0");
      await user.type(screen.getByLabelText("Membros"), "5");
      await user.type(screen.getByLabelText("Frequentadores"), "0");
      await user.type(screen.getByLabelText("Visitantes"), "0");
      await user.click(screen.getByRole("button", { name: "Salvar contagem" }));

      await waitFor(() =>
        expect(api.put).toHaveBeenCalledWith("/celebrations/instances/i2/attendance", {
          children: 0, members: 5, attendees: 0, visitors: 0,
        })
      );
      // Recarrega as instâncias para mostrar o total novo.
      await waitFor(() =>
        expect(vi.mocked(api.get).mock.calls.filter(([u]) => u === "/celebrations/instances?celebration_id=c1")).toHaveLength(2)
      );
    });

    it("fecha o formulário sem salvar", async () => {
      mockGet();
      const user = userEvent.setup();
      renderSheet();
      await screen.findByText("Instâncias (2)");
      await user.click(screen.getAllByRole("button", { name: /^Contagem de público do culto de/ })[0]);
      await user.click(await screen.findByRole("button", { name: "Voltar" }));
      await waitFor(() => expect(screen.queryByLabelText("Crianças")).not.toBeInTheDocument());
      expect(api.put).not.toHaveBeenCalled();
    });

    it("não oferece a contagem a quem não edita", async () => {
      mockGet();
      renderSheet(false);
      await screen.findByText("Instâncias (2)");
      expect(screen.queryByRole("button", { name: /^Contagem de público/ })).not.toBeInTheDocument();
    });
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

    it("fecha cada confirmação sem chamar a API: Voltar, Manter e Esc", async () => {
      mockGet();
      const user = userEvent.setup();
      renderSheet();
      await screen.findByText("Instâncias (2)");

      await user.click(screen.getAllByRole("button", { name: /^Cancelar o culto de/ })[0]);
      await user.click(await screen.findByRole("button", { name: "Voltar" }));
      await waitFor(() => expect(screen.queryByText("Cancelar este culto?")).not.toBeInTheDocument());

      await user.click(screen.getAllByRole("button", { name: /^Cancelar o culto de/ })[0]);
      await screen.findByText("Cancelar este culto?");
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByText("Cancelar este culto?")).not.toBeInTheDocument());

      await user.click(screen.getByRole("button", { name: /Cancelar uma data/ }));
      await user.click(await screen.findByRole("button", { name: "Voltar" }));
      await waitFor(() => expect(screen.queryByText("Cancelar uma data", { selector: "h2,[role=dialog] *" })).not.toBeInTheDocument());

      await user.click(screen.getByRole("button", { name: /Remover celebração/ }));
      await user.click(await screen.findByRole("button", { name: "Manter" }));
      await waitFor(() => expect(screen.queryByText("Remover esta celebração?")).not.toBeInTheDocument());

      expect(api.patch).not.toHaveBeenCalled();
      expect(api.post).not.toHaveBeenCalled();
      expect(api.delete).not.toHaveBeenCalled();
    });

    it("mostra o erro do servidor quando cancelar ou remover falha", async () => {
      mockGet();
      vi.mocked(api.patch).mockRejectedValue({ isAxiosError: true, response: { status: 400, data: { message: "O culto já foi finalizado" } } });
      vi.mocked(api.delete).mockRejectedValue(new Error("boom"));
      const user = userEvent.setup();
      renderSheet();
      await screen.findByText("Instâncias (2)");

      await user.click(screen.getAllByRole("button", { name: /^Cancelar o culto de/ })[0]);
      await user.click(await screen.findByRole("button", { name: "Cancelar culto" }));
      expect(await screen.findByText("O culto já foi finalizado")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Voltar" }));

      await user.click(screen.getByRole("button", { name: /Remover celebração/ }));
      await user.click(screen.getAllByRole("button", { name: "Remover celebração" }).at(-1)!);
      expect(await screen.findByText("Não foi possível remover a celebração.")).toBeInTheDocument();
    });

    it("em celebração avulsa, não oferece cancelar data e explica a remoção do culto único", async () => {
      vi.mocked(api.get).mockImplementation((url: string) => {
        if (url === "/celebrations/c1") return Promise.resolve({ data: { ...celebration, recurrence: "none" } });
        return Promise.resolve({ data: instances });
      });
      const user = userEvent.setup();
      renderSheet();
      await screen.findByText("Instâncias (2)");

      expect(screen.queryByRole("button", { name: /Cancelar uma data/ })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /Remover celebração/ }));
      expect(await screen.findByText(/O culto que ainda não aconteceu é apagado/)).toBeInTheDocument();
    });

    it("não oferece cancelar culto já finalizado", async () => {
      vi.mocked(api.get).mockImplementation((url: string) =>
        url === "/celebrations/c1"
          ? Promise.resolve({ data: celebration })
          : Promise.resolve({ data: [{ id: "i9", scheduled_date: "2026-09-06T00:00:00.000Z", status: "finalized" }] })
      );
      renderSheet();
      await screen.findByText("Instâncias (1)");
      expect(screen.getByText("Finalizado")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Cancelar o culto de/ })).not.toBeInTheDocument();
    });
  });
  describe("Kids", () => {
    function renderKids(canEdit: boolean) {
      mockGet();
      render(
        <CelebrationDetailSheet open onOpenChange={vi.fn()} celebrationId="c1" canEdit={canEdit} canAddSongs={false} />
      );
    }

    it("quem edita vê o modelo de turmas e abre as turmas de um culto", async () => {
      const user = userEvent.setup();
      renderKids(true);
      await screen.findByText("Instâncias (2)");
      expect(screen.getByTestId("kids-template")).toHaveTextContent("modelo:c1");

      const buttons = screen.getAllByRole("button", { name: /^Turmas kids do culto de/ });
      expect(buttons).toHaveLength(2);
      await user.click(buttons[0]);
      expect(screen.getByTestId("kids-sessions")).toHaveTextContent("sessões:i2");

      await user.click(screen.getByRole("button", { name: "fechar kids" }));
      expect(screen.queryByTestId("kids-sessions")).not.toBeInTheDocument();
    });

    it("quem só lê não vê nada de Kids", async () => {
      renderKids(false);
      await screen.findByText("Instâncias (2)");
      expect(screen.queryByTestId("kids-template")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Turmas kids do culto/ })).not.toBeInTheDocument();
    });
  });
});
