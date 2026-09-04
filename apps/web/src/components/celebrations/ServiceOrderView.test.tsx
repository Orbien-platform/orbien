import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ServiceOrderView } from "./ServiceOrderView";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const instance = {
  id: "i1",
  date: "2026-09-06T10:00:00.000Z",
  celebration: { id: "c1", name: "Culto Domingo", time: "10:00" },
};

const serviceOrder = {
  id: "so1",
  status: "draft",
  items: [
    {
      id: "it1",
      name: "Louvor de abertura",
      type: "worship",
      duration_minutes: 20,
      start_time: "10:00",
      responsible: { id: "p1", full_name: "Ana Souza" },
      notes: "Observação",
      position: 1,
      setlist: {
        id: "sl1",
        songs: [
          { id: "s1", title: "Grande é o Senhor", key: "G", bpm: 80, link: "http://x.test", position: 1 },
        ],
      },
    },
    {
      id: "it2",
      name: "Pregação",
      type: "sermon",
      position: 2,
      setlist: null,
    },
  ],
};

function mockGet(withOC: boolean) {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url === "/celebrations/instances/i1") {
      return Promise.resolve({ data: instance });
    }
    if (url === "/celebrations/instances/i1/service-order") {
      if (withOC) return Promise.resolve({ data: serviceOrder });
      return Promise.reject({ response: { status: 404 } });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

describe("ServiceOrderView", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  it("does not render content when closed", () => {
    mockGet(true);
    render(
      <ServiceOrderView
        open={false}
        onOpenChange={vi.fn()}
        instanceId="i1"
        canEdit={true}
        canAddSongs={true}
      />
    );
    expect(screen.queryByText("Culto Domingo")).not.toBeInTheDocument();
  });

  it("loads and displays the service order items", async () => {
    mockGet(true);
    render(
      <ServiceOrderView
        open={true}
        onOpenChange={vi.fn()}
        instanceId="i1"
        canEdit={true}
        canAddSongs={true}
      />
    );

    expect(await screen.findByText("Culto Domingo")).toBeInTheDocument();
    expect(screen.getByText("Louvor de abertura")).toBeInTheDocument();
    expect(screen.getAllByText("Pregação").length).toBeGreaterThan(0);
    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
    expect(screen.getByText("Grande é o Senhor")).toBeInTheDocument();
  });

  it("does not show a time separator when the celebration has no time", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") {
        return Promise.resolve({
          data: { ...instance, celebration: { ...instance.celebration, time: undefined } },
        });
      }
      if (url === "/celebrations/instances/i1/service-order") {
        return Promise.resolve({ data: serviceOrder });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Culto Domingo");
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it("shows the empty-OC state and creates one on demand", async () => {
    mockGet(false);
    vi.mocked(api.post).mockResolvedValue({ data: { id: "so-new", items: [] } });
    const user = userEvent.setup();
    render(
      <ServiceOrderView
        open={true}
        onOpenChange={vi.fn()}
        instanceId="i1"
        canEdit={true}
        canAddSongs={true}
      />
    );

    expect(
      await screen.findByText("Esta instância ainda não tem uma Ordem de Celebração.")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Criar Ordem de Celebração" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/celebrations/service-orders", {
        instance_id: "i1",
      })
    );

    expect(await screen.findByText("Nenhuma etapa adicionada.")).toBeInTheDocument();
  });

  it("reorders items and persists the new positions", async () => {
    mockGet(true);
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(
      <ServiceOrderView
        open={true}
        onOpenChange={vi.fn()}
        instanceId="i1"
        canEdit={true}
        canAddSongs={true}
      />
    );

    await screen.findByText("Louvor de abertura");

    const moveDownButtons = screen.getAllByRole("button", { name: "Mover para baixo" });
    await user.click(moveDownButtons[0]);

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/celebrations/service-orders/items/it1", {
        position: 2,
      })
    );
    expect(api.patch).toHaveBeenCalledWith("/celebrations/service-orders/items/it2", {
      position: 1,
    });

    const text = document.body.textContent ?? "";
    expect(text.indexOf("Pregação")).toBeLessThan(text.indexOf("Louvor de abertura"));
  });

  it("deletes an item", async () => {
    mockGet(true);
    vi.mocked(api.delete).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(
      <ServiceOrderView
        open={true}
        onOpenChange={vi.fn()}
        instanceId="i1"
        canEdit={true}
        canAddSongs={true}
      />
    );

    await screen.findAllByText("Pregação");
    const deleteButtons = screen.getAllByRole("button", { name: "Remover etapa" });
    await user.click(deleteButtons[1]);

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith("/celebrations/service-orders/items/it2")
    );
    await waitFor(() => expect(screen.queryAllByText("Pregação")).toHaveLength(0));
  });

  it("exports the PDF", async () => {
    mockGet(true);
    vi.mocked(api.post).mockResolvedValue({ data: new Blob(["pdf"]) });
    const user = userEvent.setup();
    render(
      <ServiceOrderView
        open={true}
        onOpenChange={vi.fn()}
        instanceId="i1"
        canEdit={true}
        canAddSongs={true}
      />
    );

    await screen.findByText("Louvor de abertura");
    await user.click(screen.getByRole("button", { name: /PDF/ }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/celebrations/instances/i1/export-pdf",
        {},
        { responseType: "blob" }
      )
    );
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it("shows a toast when PDF export fails", async () => {
    mockGet(true);
    vi.mocked(api.post).mockRejectedValue(new Error("fail"));
    const user = userEvent.setup();
    render(
      <ServiceOrderView
        open={true}
        onOpenChange={vi.fn()}
        instanceId="i1"
        canEdit={true}
        canAddSongs={true}
      />
    );

    await screen.findByText("Louvor de abertura");
    await user.click(screen.getByRole("button", { name: /PDF/ }));

    expect(await screen.findByText("Exportação PDF não disponível.")).toBeInTheDocument();
  });

  it("renders the icon for every item type", async () => {
    const mixedOrder = {
      id: "so1",
      status: "draft",
      items: [
        { id: "it3", name: "Oração inicial", type: "prayer", position: 1, setlist: null },
        { id: "it4", name: "Avisos da semana", type: "announcements", position: 2, setlist: null },
        { id: "it5", name: "Oferta e dízimo", type: "offering", position: 3, setlist: null },
        { id: "it6", name: "Etapa livre", type: "other", position: 4, setlist: null },
      ],
    };
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") return Promise.resolve({ data: instance });
      if (url === "/celebrations/instances/i1/service-order") return Promise.resolve({ data: mixedOrder });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    expect(await screen.findByText("Oração inicial")).toBeInTheDocument();
    expect(screen.getByText("Avisos da semana")).toBeInTheDocument();
    expect(screen.getByText("Oferta e dízimo")).toBeInTheDocument();
    expect(screen.getByText("Etapa livre")).toBeInTheDocument();
  });

  it("moves an item up and persists the new position", async () => {
    mockGet(true);
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Louvor de abertura");

    const moveUpButtons = screen.getAllByRole("button", { name: "Mover para cima" });
    // it1 is first (disabled); it2 is second and movable up.
    await user.click(moveUpButtons[1]);

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/celebrations/service-orders/items/it2", {
        position: 1,
      })
    );
    expect(api.patch).toHaveBeenCalledWith("/celebrations/service-orders/items/it1", {
      position: 2,
    });
  });

  it("reloads the service order when persisting a reorder fails", async () => {
    mockGet(true);
    vi.mocked(api.patch).mockRejectedValue(new Error("fail"));
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Louvor de abertura");
    const before = vi.mocked(api.get).mock.calls.length;

    const moveDownButtons = screen.getAllByRole("button", { name: "Mover para baixo" });
    await user.click(moveDownButtons[0]);

    await waitFor(() =>
      expect(vi.mocked(api.get).mock.calls.length).toBeGreaterThan(before)
    );
  });

  it("shows a toast that clears itself when deleting an item fails", async () => {
    mockGet(true);
    vi.mocked(api.delete).mockRejectedValue(new Error("fail"));
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Louvor de abertura");
    const deleteButtons = screen.getAllByRole("button", { name: "Remover etapa" });
    await user.click(deleteButtons[0]);

    expect(await screen.findByText("Erro ao remover etapa.")).toBeInTheDocument();

    await waitFor(
      () => expect(screen.queryByText("Erro ao remover etapa.")).not.toBeInTheDocument(),
      { timeout: 4000 }
    );
  }, 8000);

  it("shows a toast when creating the service order fails", async () => {
    mockGet(false);
    vi.mocked(api.post).mockRejectedValue(new Error("fail"));
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Esta instância ainda não tem uma Ordem de Celebração.");
    await user.click(screen.getByRole("button", { name: "Criar Ordem de Celebração" }));

    expect(await screen.findByText("Erro ao criar Ordem de Celebração.")).toBeInTheDocument();
  });

  it("opens the add-item modal from the empty-items state", async () => {
    const emptyOrder = { id: "so1", status: "draft", items: [] };
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") return Promise.resolve({ data: instance });
      if (url === "/celebrations/instances/i1/service-order") return Promise.resolve({ data: emptyOrder });
      if (url.startsWith("/persons")) return Promise.resolve({ data: { data: [] } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Nenhuma etapa adicionada.");
    await user.click(screen.getByRole("button", { name: "Adicionar primeira etapa" }));
    expect(await screen.findByText("Nova etapa")).toBeInTheDocument();
  });

  it("adds an item through the top-bar button and reloads the service order", async () => {
    const emptyOrder = { id: "so1", status: "draft", items: [] };
    const reloadedOrder = { id: "so1", status: "draft", items: [{ id: "it9", name: "Nova etapa", type: "other", position: 1, setlist: null }] };
    let getCalls = 0;
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") return Promise.resolve({ data: instance });
      if (url === "/celebrations/instances/i1/service-order") {
        getCalls += 1;
        return Promise.resolve({ data: getCalls === 1 ? emptyOrder : reloadedOrder });
      }
      if (url.startsWith("/persons")) return Promise.resolve({ data: { data: [] } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Nenhuma etapa adicionada.");
    await user.click(screen.getByRole("button", { name: "Etapa" }));
    await user.type(screen.getByLabelText(/Nome da etapa/), "Bênção final");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/celebrations/service-orders/so1/items",
        expect.objectContaining({ name: "Bênção final" })
      )
    );
    expect(await screen.findByText("Nova etapa")).toBeInTheDocument();
  });

  it("resets state when the dialog is closed", async () => {
    mockGet(true);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={onOpenChange} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Louvor de abertura");
    await user.click(screen.getByRole("button", { name: "Fechar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows a generic empty state when the instance itself fails to load", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") return Promise.reject(new Error("fail"));
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    expect(await screen.findByText("Nenhuma etapa adicionada.")).toBeInTheDocument();
    expect(screen.getByText("Ordem de Celebração")).toBeInTheDocument();
  });

  it("ignores a stale instance response once the instance id changes before it resolves", async () => {
    let resolveInstance!: (v: { data: unknown }) => void;
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") {
        return new Promise((resolve) => { resolveInstance = resolve; });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    const { rerender } = render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    rerender(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId={null} canEdit={true} canAddSongs={true} />
    );

    resolveInstance({ data: instance });
    await Promise.resolve();
    await Promise.resolve();

    // The stale response must not surface after the instance id was cleared.
    expect(screen.queryByText("Culto Domingo")).not.toBeInTheDocument();
  });

  it("ignores a stale service-order response (success and failure) once cancelled", async () => {
    let resolveSO!: (v: { data: unknown }) => void;
    let rejectSO!: (e: unknown) => void;
    let callCount = 0;
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") return Promise.resolve({ data: instance });
      if (url === "/celebrations/instances/i1/service-order") {
        callCount += 1;
        if (callCount === 1) {
          return new Promise((resolve) => { resolveSO = resolve; });
        }
        return new Promise((_resolve, reject) => { rejectSO = reject; });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    const { rerender } = render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );
    await screen.findByText("Culto Domingo");

    rerender(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId={null} canEdit={true} canAddSongs={true} />
    );
    resolveSO({ data: serviceOrder });
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText("Louvor de abertura")).not.toBeInTheDocument();

    // Second round exercises the cancelled-catch branch.
    rerender(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );
    await screen.findByText("Culto Domingo");
    rerender(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId={null} canEdit={true} canAddSongs={true} />
    );
    rejectSO({ response: { status: 500 } });
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText("Louvor de abertura")).not.toBeInTheDocument();
  });

  it("shows multiple setlist songs sorted by position", async () => {
    const twoSongsOrder = {
      id: "so1",
      status: "draft",
      items: [
        {
          id: "it7",
          name: "Louvor",
          type: "worship",
          position: 1,
          setlist: {
            id: "sl2",
            songs: [
              { id: "s2", title: "Segunda música", position: 2 },
              { id: "s1", title: "Primeira música", position: 1 },
            ],
          },
        },
      ],
    };
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") return Promise.resolve({ data: instance });
      if (url === "/celebrations/instances/i1/service-order") return Promise.resolve({ data: twoSongsOrder });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Primeira música");
    const text = document.body.textContent ?? "";
    expect(text.indexOf("Primeira música")).toBeLessThan(text.indexOf("Segunda música"));
  });

  it("removes a song from a setlist", async () => {
    mockGet(true);
    vi.mocked(api.delete).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Grande é o Senhor");
    await user.click(screen.getByRole("button", { name: "Remover música" }));

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith("/celebrations/setlists/songs/s1")
    );
    await waitFor(() => expect(screen.queryByText("Grande é o Senhor")).not.toBeInTheDocument());
  });

  it("shows a toast when removing a song fails", async () => {
    mockGet(true);
    vi.mocked(api.delete).mockRejectedValue(new Error("fail"));
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Grande é o Senhor");
    await user.click(screen.getByRole("button", { name: "Remover música" }));

    expect(await screen.findByText("Erro ao remover música.")).toBeInTheDocument();
  });

  it("creates a setlist on demand and adds a song, reloading the service order", async () => {
    const noSetlistOrder = {
      id: "so1",
      status: "draft",
      items: [{ id: "it8", name: "Momento de louvor", type: "worship", position: 1, setlist: null }],
    };
    const reloadedOrder = {
      id: "so1",
      status: "draft",
      items: [{ id: "it8", name: "Momento de louvor", type: "worship", position: 1, setlist: { id: "sl9", songs: [{ id: "s9", title: "Nova música", position: 1 }] } }],
    };
    let soCalls = 0;
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") return Promise.resolve({ data: instance });
      if (url === "/celebrations/instances/i1/service-order") {
        soCalls += 1;
        return Promise.resolve({ data: soCalls === 1 ? noSetlistOrder : reloadedOrder });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === "/celebrations/setlists") return Promise.resolve({ data: { id: "sl9", songs: [] } });
      if (url === "/celebrations/setlists/sl9/songs") return Promise.resolve({ data: {} });
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Momento de louvor");
    await user.click(screen.getByRole("button", { name: "Adicionar música" }));

    expect(api.post).toHaveBeenCalledWith("/celebrations/setlists", { service_order_item_id: "it8" });

    const titleInput = await screen.findByPlaceholderText("Título *");
    await user.type(titleInput, "Nova música");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/celebrations/setlists/sl9/songs",
        expect.objectContaining({ title: "Nova música", position: 1 })
      )
    );
    expect(await screen.findByText("Nova música")).toBeInTheDocument();
  });

  it("shows a toast when creating a setlist fails", async () => {
    const noSetlistOrder = {
      id: "so1",
      status: "draft",
      items: [{ id: "it8", name: "Momento de louvor", type: "worship", position: 1, setlist: null }],
    };
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") return Promise.resolve({ data: instance });
      if (url === "/celebrations/instances/i1/service-order") return Promise.resolve({ data: noSetlistOrder });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    vi.mocked(api.post).mockRejectedValue(new Error("fail"));
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Momento de louvor");
    await user.click(screen.getByRole("button", { name: "Adicionar música" }));

    expect(await screen.findByText("Erro ao criar setlist.")).toBeInTheDocument();
  });

  it("validates and cancels the add-song form", async () => {
    mockGet(true);
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Grande é o Senhor");
    await user.click(screen.getByRole("button", { name: "Adicionar música" }));

    const addBtn = await screen.findByRole("button", { name: "Adicionar" });
    await user.click(addBtn);
    expect(await screen.findByText("Título é obrigatório.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByPlaceholderText("Título *")).not.toBeInTheDocument();
  });

  it("shows an error message when adding a song fails", async () => {
    mockGet(true);
    vi.mocked(api.post).mockRejectedValue(new Error("fail"));
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Grande é o Senhor");
    await user.click(screen.getByRole("button", { name: "Adicionar música" }));

    const titleInput = await screen.findByPlaceholderText("Título *");
    await user.type(titleInput, "Nova música");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(await screen.findByText("Erro ao adicionar música.")).toBeInTheDocument();
  });

  it("adds a song with key, bpm and link filled in", async () => {
    mockGet(true);
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Grande é o Senhor");
    await user.click(screen.getByRole("button", { name: "Adicionar música" }));

    await user.type(await screen.findByPlaceholderText("Título *"), "Nova música");
    await user.type(screen.getByPlaceholderText("Tom (ex: G)"), "D");
    await user.type(screen.getByPlaceholderText("BPM"), "120");
    await user.type(screen.getByPlaceholderText("Link (YouTube, Cifra Club…)"), "http://y.test");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/celebrations/setlists/sl1/songs", {
        title: "Nova música",
        key: "D",
        bpm: 120,
        link: "http://y.test",
        position: 2,
      })
    );
  });

  it("ignores the instance response if the component unmounts before it settles", async () => {
    let rejectGet!: (err: unknown) => void;
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") {
        return new Promise((_resolve, reject) => { rejectGet = reject; });
      }
      return Promise.reject({ response: { status: 404 } });
    });
    const { unmount } = render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );
    unmount();

    rejectGet(new Error("too late"));
    await Promise.resolve();
    await Promise.resolve();
  });
});
