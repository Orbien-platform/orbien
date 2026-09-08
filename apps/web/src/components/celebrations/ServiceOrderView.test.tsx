import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ServiceOrderView } from "./ServiceOrderView";
import api from "@/lib/api";
import type { CatalogSong } from "@/lib/repertorio";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const instanceWithOC = {
  id: "i1",
  scheduled_date: "2026-09-06T10:00:00.000Z",
  celebration: { id: "c1", name: "Culto Domingo", start_time: "10:00" },
  serviceOrder: { id: "so1", title: "OC Domingo", published_at: null },
};

const instanceWithoutOC = {
  id: "i1",
  scheduled_date: "2026-09-06T10:00:00.000Z",
  celebration: { id: "c1", name: "Culto Domingo", start_time: "10:00" },
  serviceOrder: null,
};

const serviceOrder = {
  id: "so1",
  title: "OC Domingo",
  items: [
    {
      id: "it1",
      name: "Louvor de abertura",
      type: "worship",
      sequence: 1,
      duration_minutes: 20,
      start_offset_minutes: 0,
      responsible_type: "person",
      person: { id: "p1", full_name: "Ana Souza" },
      notes: "Observação",
      setlist: {
        id: "sl1",
        songs: [
          { id: "s1", title: "Grande é o Senhor", key: "G", bpm: 80, link: "http://x.test", sequence: 1 },
        ],
      },
    },
    {
      id: "it2",
      name: "Pregação",
      type: "sermon",
      sequence: 2,
      duration_minutes: 30,
      start_offset_minutes: 30,
      responsible_type: "free_text",
      responsible_label: "A definir",
      setlist: null,
    },
  ],
};

/** Música do catálogo no formato que `GET /songs` devolve ao seletor. */
function catalogSong(overrides: Partial<CatalogSong> = {}): CatalogSong {
  return {
    id: "cs1",
    title: "Digno é o Senhor",
    key: "E",
    key_alt: null,
    bpm: 90,
    link: null,
    youtube_link: null,
    spotify_link: null,
    cifra_club_link: null,
    notes: null,
    last_played_at: null,
    ...overrides,
  };
}

/**
 * Ordem de culto com uma única música na setlist da etapa de louvor — os
 * campos congelados são sempre os mesmos; o teste sobrescreve só o vínculo
 * (`song_id`) e a referência (`song`).
 */
function orderWithSetlistSong(overrides: Record<string, unknown>) {
  return {
    ...serviceOrder,
    items: serviceOrder.items.map((item) =>
      item.id !== "it1"
        ? item
        : {
            ...item,
            setlist: {
              id: "sl1",
              songs: [
                {
                  id: "s1",
                  title: "Grande é o Senhor",
                  key: "G",
                  bpm: 80,
                  link: "http://x.test",
                  sequence: 1,
                  ...overrides,
                },
              ],
            },
          }
    ),
  };
}

function mockGet(withOC: boolean, catalog: unknown[] = []) {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url === "/celebrations/instances/i1") {
      return Promise.resolve({ data: withOC ? instanceWithOC : instanceWithoutOC });
    }
    if (url === "/celebrations/orders/so1") {
      return Promise.resolve({ data: serviceOrder });
    }
    if (url === "/songs") {
      return Promise.resolve({ data: catalog });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

describe("ServiceOrderView", () => {
  beforeEach(() => {
    vi.stubGlobal("open", vi.fn());
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
    expect(screen.getByText("A definir")).toBeInTheDocument();
    expect(screen.getByText("Grande é o Senhor")).toBeInTheDocument();
  });

  it("does not show a time separator when the celebration's start_time is malformed", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") {
        return Promise.resolve({
          data: { ...instanceWithOC, celebration: { ...instanceWithOC.celebration, start_time: "meio-dia" } },
        });
      }
      if (url === "/celebrations/orders/so1") {
        return Promise.resolve({ data: serviceOrder });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    // O cabeçalho mostra o horário de início cru da celebração (mesmo
    // malformado); é o cálculo por etapa (`fmtItemTime`) que descarta um
    // formato inválido e não gera um horário — sem quebrar a tela.
    await screen.findByText("Louvor de abertura");
    expect(screen.getByText(/meio-dia/)).toBeInTheDocument();
    expect(screen.queryByText(/^\d{2}:\d{2}$/)).not.toBeInTheDocument();
  });

  it("mostra o nome do ministério responsável e trata rótulo/pessoa ausente", async () => {
    const mixedResponsibleOrder = {
      id: "so1",
      title: "OC",
      items: [
        {
          id: "it10",
          name: "Escala do ministério",
          type: "other",
          sequence: 1,
          duration_minutes: 5,
          start_offset_minutes: 0,
          responsible_type: "ministry",
          ministry: { id: "m1", name: "Ministério de Louvor" },
          setlist: null,
        },
        {
          id: "it11",
          name: "Etapa sem responsável definido",
          type: "other",
          sequence: 2,
          duration_minutes: 5,
          start_offset_minutes: 5,
          responsible_type: "free_text",
          responsible_label: null,
          setlist: null,
        },
        {
          id: "it12",
          name: "Etapa com pessoa não carregada",
          type: "other",
          sequence: 3,
          duration_minutes: 5,
          start_offset_minutes: 10,
          responsible_type: "person",
          person: null,
          setlist: null,
        },
      ],
    };
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") return Promise.resolve({ data: instanceWithOC });
      if (url === "/celebrations/orders/so1") return Promise.resolve({ data: mixedResponsibleOrder });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    expect(await screen.findByText("Ministério de Louvor")).toBeInTheDocument();
    expect(screen.getByText("Etapa sem responsável definido")).toBeInTheDocument();
    expect(screen.getByText("Etapa com pessoa não carregada")).toBeInTheDocument();
  });

  it("does not show a time separator when the celebration has no start_time", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") {
        return Promise.resolve({
          data: { ...instanceWithOC, celebration: { ...instanceWithOC.celebration, start_time: undefined } },
        });
      }
      if (url === "/celebrations/orders/so1") {
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
    vi.mocked(api.post).mockResolvedValue({ data: { id: "so-new", title: "Ordem de Culto — Culto Domingo" } });
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
      expect(api.post).toHaveBeenCalledWith("/celebrations/orders", {
        celebration_instance_id: "i1",
        title: "Ordem de Culto — Culto Domingo",
      })
    );

    expect(await screen.findByText("Nenhuma etapa adicionada.")).toBeInTheDocument();
  });

  it("reorders items and persists the new sequence", async () => {
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
      expect(api.patch).toHaveBeenCalledWith("/celebrations/items/it1", {
        sequence: 2,
      })
    );
    expect(api.patch).toHaveBeenCalledWith("/celebrations/items/it2", {
      sequence: 1,
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
      expect(api.delete).toHaveBeenCalledWith("/celebrations/items/it2")
    );
    await waitFor(() => expect(screen.queryAllByText("Pregação")).toHaveLength(0));
  });

  it("exports the PDF", async () => {
    mockGet(true);
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") return Promise.resolve({ data: instanceWithOC });
      if (url === "/celebrations/orders/so1") return Promise.resolve({ data: serviceOrder });
      if (url === "/celebrations/orders/so1/pdf") {
        return Promise.resolve({ data: { pdf_url: "https://storage.test/oc.pdf" } });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
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

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/celebrations/orders/so1/pdf"));
    expect(window.open).toHaveBeenCalledWith(
      "https://storage.test/oc.pdf",
      "_blank",
      "noopener,noreferrer"
    );
  });

  it("shows a toast when PDF export fails", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") return Promise.resolve({ data: instanceWithOC });
      if (url === "/celebrations/orders/so1") return Promise.resolve({ data: serviceOrder });
      if (url === "/celebrations/orders/so1/pdf") return Promise.reject(new Error("fail"));
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
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
      title: "OC",
      items: [
        { id: "it3", name: "Oração inicial", type: "prayer", sequence: 1, duration_minutes: 5, start_offset_minutes: 0, responsible_type: "free_text", responsible_label: "x", setlist: null },
        { id: "it4", name: "Avisos da semana", type: "announcements", sequence: 2, duration_minutes: 5, start_offset_minutes: 5, responsible_type: "free_text", responsible_label: "x", setlist: null },
        { id: "it5", name: "Oferta e dízimo", type: "offering", sequence: 3, duration_minutes: 5, start_offset_minutes: 10, responsible_type: "free_text", responsible_label: "x", setlist: null },
        { id: "it6", name: "Etapa livre", type: "other", sequence: 4, duration_minutes: 5, start_offset_minutes: 15, responsible_type: "free_text", responsible_label: "x", setlist: null },
      ],
    };
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") return Promise.resolve({ data: instanceWithOC });
      if (url === "/celebrations/orders/so1") return Promise.resolve({ data: mixedOrder });
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

  it("moves an item up and persists the new sequence", async () => {
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
      expect(api.patch).toHaveBeenCalledWith("/celebrations/items/it2", {
        sequence: 1,
      })
    );
    expect(api.patch).toHaveBeenCalledWith("/celebrations/items/it1", {
      sequence: 2,
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
    const emptyOrder = { id: "so1", title: "OC", items: [] };
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") return Promise.resolve({ data: instanceWithOC });
      if (url === "/celebrations/orders/so1") return Promise.resolve({ data: emptyOrder });
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
    const emptyOrder = { id: "so1", title: "OC", items: [] };
    const reloadedOrder = {
      id: "so1",
      title: "OC",
      items: [
        {
          id: "it9",
          name: "Bênção final",
          type: "other",
          sequence: 1,
          duration_minutes: 5,
          start_offset_minutes: 0,
          responsible_type: "free_text",
          responsible_label: "A definir",
          setlist: null,
        },
      ],
    };
    let getCalls = 0;
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") return Promise.resolve({ data: instanceWithOC });
      if (url === "/celebrations/orders/so1") {
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
    await user.type(screen.getByLabelText(/Duração/), "5");
    await user.type(screen.getByLabelText(/Horário/), "10:30");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/celebrations/items",
        expect.objectContaining({ service_order_id: "so1", name: "Bênção final" })
      )
    );
    expect(await screen.findByText("Bênção final")).toBeInTheDocument();
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

    resolveInstance({ data: instanceWithOC });
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
      if (url === "/celebrations/instances/i1") return Promise.resolve({ data: instanceWithOC });
      if (url === "/celebrations/orders/so1") {
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

  it("shows multiple setlist songs sorted by sequence", async () => {
    const twoSongsOrder = {
      id: "so1",
      title: "OC",
      items: [
        {
          id: "it7",
          name: "Louvor",
          type: "worship",
          sequence: 1,
          duration_minutes: 20,
          start_offset_minutes: 0,
          responsible_type: "free_text",
          responsible_label: "x",
          setlist: {
            id: "sl2",
            songs: [
              { id: "s2", title: "Segunda música", sequence: 2 },
              { id: "s1", title: "Primeira música", sequence: 1 },
            ],
          },
        },
      ],
    };
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") return Promise.resolve({ data: instanceWithOC });
      if (url === "/celebrations/orders/so1") return Promise.resolve({ data: twoSongsOrder });
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
      title: "OC",
      items: [{ id: "it8", name: "Momento de louvor", type: "worship", sequence: 1, duration_minutes: 20, start_offset_minutes: 0, responsible_type: "free_text", responsible_label: "x", setlist: null }],
    };
    const reloadedOrder = {
      id: "so1",
      title: "OC",
      items: [{ id: "it8", name: "Momento de louvor", type: "worship", sequence: 1, duration_minutes: 20, start_offset_minutes: 0, responsible_type: "free_text", responsible_label: "x", setlist: { id: "sl9", songs: [{ id: "s9", title: "Nova música", sequence: 1 }] } }],
    };
    let soCalls = 0;
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") return Promise.resolve({ data: instanceWithOC });
      if (url === "/celebrations/orders/so1") {
        soCalls += 1;
        return Promise.resolve({ data: soCalls === 1 ? noSetlistOrder : reloadedOrder });
      }
      if (url === "/songs") return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === "/celebrations/setlists") return Promise.resolve({ data: { id: "sl9", songs: [] } });
      if (url === "/celebrations/setlists/songs") return Promise.resolve({ data: {} });
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
        "/celebrations/setlists/songs",
        expect.objectContaining({ setlist_id: "sl9", title: "Nova música", sequence: 1 })
      )
    );
    expect(await screen.findByText("Nova música")).toBeInTheDocument();
  });

  it("shows a toast when creating a setlist fails", async () => {
    const noSetlistOrder = {
      id: "so1",
      title: "OC",
      items: [{ id: "it8", name: "Momento de louvor", type: "worship", sequence: 1, duration_minutes: 20, start_offset_minutes: 0, responsible_type: "free_text", responsible_label: "x", setlist: null }],
    };
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") return Promise.resolve({ data: instanceWithOC });
      if (url === "/celebrations/orders/so1") return Promise.resolve({ data: noSetlistOrder });
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
      expect(api.post).toHaveBeenCalledWith("/celebrations/setlists/songs", {
        setlist_id: "sl1",
        song_id: undefined,
        sequence: 2,
        title: "Nova música",
        key: "D",
        bpm: 120,
        link: "http://y.test",
      })
    );
  });

  it("escolhe do catálogo pelo seletor, preenche os campos e envia song_id no POST", async () => {
    mockGet(true, [
      catalogSong({ id: "cs1", title: "Digno é o Senhor", key: "E", bpm: 90, link: "http://cifra.test/x" }),
    ]);
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Grande é o Senhor");
    await user.click(screen.getByRole("button", { name: "Adicionar música" }));

    await user.click(await screen.findByRole("button", { name: /Digno é o Senhor/ }));

    expect(screen.getByPlaceholderText("Título *")).toHaveValue("Digno é o Senhor");
    expect(screen.getByPlaceholderText("Tom (ex: G)")).toHaveValue("E");
    expect(screen.getByPlaceholderText("BPM")).toHaveValue(90);
    expect(screen.getByPlaceholderText("Link (YouTube, Cifra Club…)")).toHaveValue("http://cifra.test/x");

    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/celebrations/setlists/songs",
        expect.objectContaining({ setlist_id: "sl1", song_id: "cs1", title: "Digno é o Senhor" })
      )
    );
  });

  it("mantém o form utilizável quando a resposta de /songs não é uma lista", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") return Promise.resolve({ data: instanceWithOC });
      if (url === "/celebrations/orders/so1") return Promise.resolve({ data: serviceOrder });
      if (url === "/songs") return Promise.resolve({ data: null });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Grande é o Senhor");
    await user.click(screen.getByRole("button", { name: "Adicionar música" }));

    expect(
      await screen.findByText("Nenhuma música no repertório desta congregação.")
    ).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Título *"), "Avulsa");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/celebrations/setlists/songs",
        expect.objectContaining({ setlist_id: "sl1", song_id: undefined, title: "Avulsa" })
      )
    );
  });

  it("buscar no seletor depois de escolher não apaga os campos já preenchidos", async () => {
    mockGet(true, [
      catalogSong({ id: "cs1", title: "Digno é o Senhor", key: "E", bpm: 90, link: "http://cifra.test/x" }),
    ]);
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Grande é o Senhor");
    await user.click(screen.getByRole("button", { name: "Adicionar música" }));
    await user.click(await screen.findByRole("button", { name: /Digno é o Senhor/ }));
    expect(screen.getByPlaceholderText("Título *")).toHaveValue("Digno é o Senhor");

    await user.type(screen.getByPlaceholderText("Buscar no repertório…"), "zzz");

    expect(screen.getByPlaceholderText("Título *")).toHaveValue("Digno é o Senhor");
    expect(screen.getByPlaceholderText("Tom (ex: G)")).toHaveValue("E");
  });

  it("fills blank tom/bpm/link when the selected catalog song has none of them set", async () => {
    mockGet(true, [catalogSong({ id: "cs2", title: "Aleluia", key: null, bpm: null, link: null })]);
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Grande é o Senhor");
    await user.click(screen.getByRole("button", { name: "Adicionar música" }));
    await user.click(await screen.findByRole("button", { name: /Aleluia/ }));

    expect(screen.getByPlaceholderText("Título *")).toHaveValue("Aleluia");
    expect(screen.getByPlaceholderText("Tom (ex: G)")).toHaveValue("");
    expect(screen.getByPlaceholderText("BPM")).toHaveValue(null);
    expect(screen.getByPlaceholderText("Link (YouTube, Cifra Club…)")).toHaveValue("");
  });

  it("keeps song_id set and sends the edited value after overriding a field from the catalog", async () => {
    mockGet(true, [
      catalogSong({ id: "cs1", title: "Digno é o Senhor", key: "E", bpm: 90, link: "http://cifra.test/x" }),
    ]);
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Grande é o Senhor");
    await user.click(screen.getByRole("button", { name: "Adicionar música" }));

    await user.click(await screen.findByRole("button", { name: /Digno é o Senhor/ }));

    const keyInput = screen.getByPlaceholderText("Tom (ex: G)");
    await user.clear(keyInput);
    await user.type(keyInput, "F");

    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/celebrations/setlists/songs",
        expect.objectContaining({ setlist_id: "sl1", song_id: "cs1", key: "F" })
      )
    );
  });

  it("lets the confirmed tom be chosen between the catalog's two versions", async () => {
    mockGet(true, [
      catalogSong({ id: "cs3", title: "Digno é o Senhor", key: "E", key_alt: "F#", bpm: 90, link: null }),
    ]);
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Grande é o Senhor");
    await user.click(screen.getByRole("button", { name: "Adicionar música" }));
    await user.click(await screen.findByRole("button", { name: /Digno é o Senhor/ }));

    expect(screen.getByPlaceholderText("Tom (ex: G)")).toHaveValue("E");
    await user.selectOptions(screen.getByLabelText("Tom confirmado para a escala"), "F#");
    expect(screen.getByPlaceholderText("Tom (ex: G)")).toHaveValue("F#");

    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/celebrations/setlists/songs",
        expect.objectContaining({ setlist_id: "sl1", song_id: "cs3", key: "F#" })
      )
    );
  });

  it("defaults to the alternate tom when it's the catalog song's only one set", async () => {
    mockGet(true, [
      catalogSong({ id: "cs4", title: "Aleluia", key: null, key_alt: "C", bpm: null, link: null }),
    ]);
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Grande é o Senhor");
    await user.click(screen.getByRole("button", { name: "Adicionar música" }));
    await user.click(await screen.findByRole("button", { name: /Aleluia/ }));

    // Sem tom principal, o seletor só tem a opção do tom alternativo — o
    // estado precisa nascer nela, e não vazio, para bater com o que a tela
    // mostra como selecionado sem exigir um clique extra do usuário.
    expect(screen.getByLabelText("Tom confirmado para a escala")).toHaveValue("C");
    expect(screen.getByPlaceholderText("Tom (ex: G)")).toHaveValue("C");

    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/celebrations/setlists/songs",
        expect.objectContaining({ setlist_id: "sl1", song_id: "cs4", key: "C" })
      )
    );
  });

  it("still allows adding a free-text song without selecting anything from the catalog", async () => {
    mockGet(true, [
      catalogSong({ id: "cs1", title: "Digno é o Senhor", key: "E", bpm: 90, link: "http://cifra.test/x" }),
    ]);
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Grande é o Senhor");
    await user.click(screen.getByRole("button", { name: "Adicionar música" }));

    await user.type(await screen.findByPlaceholderText("Título *"), "Avulsa");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/celebrations/setlists/songs",
        expect.objectContaining({ setlist_id: "sl1", song_id: undefined, title: "Avulsa" })
      )
    );
  });

  it("catálogo vazio informa a ausência e oferece cadastro, sem impedir a entrada avulsa", async () => {
    mockGet(true, []);
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Grande é o Senhor");
    await user.click(screen.getByRole("button", { name: "Adicionar música" }));

    expect(
      await screen.findByText("Nenhuma música no repertório desta congregação.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Cadastrar música no repertório/ })
    ).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Título *"), "Avulsa");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/celebrations/setlists/songs",
        expect.objectContaining({ setlist_id: "sl1", title: "Avulsa" })
      )
    );
  });

  it("cadastrar pelo seletor deixa a música nova já selecionada no form", async () => {
    mockGet(true, []);
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === "/songs") {
        return Promise.resolve({ data: { id: "novo", title: "Grande é o Nosso Deus", key: "A", bpm: 72, link: null } });
      }
      if (url === "/celebrations/setlists/songs") return Promise.resolve({ data: {} });
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Grande é o Senhor");
    await user.click(screen.getByRole("button", { name: "Adicionar música" }));
    await user.click(
      await screen.findByRole("button", { name: /Cadastrar música no repertório/ })
    );

    await user.type(screen.getByLabelText("Título"), "Grande é o Nosso Deus");
    await user.click(screen.getByRole("button", { name: "Criar e usar" }));

    await waitFor(() =>
      expect(screen.getByPlaceholderText("Título *")).toHaveValue("Grande é o Nosso Deus")
    );
    expect(screen.getByPlaceholderText("Tom (ex: G)")).toHaveValue("A");
    expect(screen.getByPlaceholderText("BPM")).toHaveValue(72);

    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/celebrations/setlists/songs",
        expect.objectContaining({ setlist_id: "sl1", song_id: "novo", title: "Grande é o Nosso Deus" })
      )
    );
  });

  // O picker vive ao lado do `<form>` da setlist, não dentro dele: os campos de
  // texto do picker são descendentes de outra árvore, então Enter neles não
  // dispara a submissão implícita do form (que tem `type="submit"`). Estes dois
  // testes trancam isso — sem eles, mover o picker de volta para dentro do
  // `<form>` voltaria a fazer Enter na busca postar a setlist em silêncio.
  it("Enter na busca do seletor não submete o form da setlist", async () => {
    mockGet(true, [catalogSong({ id: "cs1", title: "Digno é o Senhor" })]);
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Grande é o Senhor");
    await user.click(screen.getByRole("button", { name: "Adicionar música" }));

    // Título já preenchido pela escolha no catálogo: se o Enter submetesse,
    // a validação passaria e sairia um POST de verdade.
    await user.click(await screen.findByRole("button", { name: /Digno é o Senhor/ }));
    expect(screen.getByPlaceholderText("Título *")).toHaveValue("Digno é o Senhor");

    vi.mocked(api.post).mockClear();
    await user.type(screen.getByPlaceholderText("Buscar no repertório…"), "digno{Enter}");

    expect(api.post).not.toHaveBeenCalled();
  });

  it("Enter no cadastro inline não submete o form da setlist", async () => {
    mockGet(true, [catalogSong({ id: "cs1", title: "Digno é o Senhor" })]);
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Grande é o Senhor");
    await user.click(screen.getByRole("button", { name: "Adicionar música" }));
    await user.click(await screen.findByRole("button", { name: /Digno é o Senhor/ }));
    await user.click(screen.getByRole("button", { name: /Cadastrar música no repertório/ }));

    vi.mocked(api.post).mockClear();
    await user.type(await screen.findByLabelText("Título"), "Outra música{Enter}");

    // Nem o POST da setlist, nem o de /songs — o Enter não é atalho de
    // cadastro; quem cria é o botão do painel.
    expect(api.post).not.toHaveBeenCalled();
  });

  it("still allows adding a free-text song when loading the catalog fails", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") return Promise.resolve({ data: instanceWithOC });
      if (url === "/celebrations/orders/so1") return Promise.resolve({ data: serviceOrder });
      if (url === "/songs") return Promise.reject(new Error("falha de rede"));
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Grande é o Senhor");
    await user.click(screen.getByRole("button", { name: "Adicionar música" }));
    await screen.findByPlaceholderText("Título *");

    expect(
      await screen.findByText("Não foi possível carregar o catálogo.")
    ).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Título *"), "Música avulsa");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/celebrations/setlists/songs",
        expect.objectContaining({ setlist_id: "sl1", title: "Música avulsa" })
      )
    );
  });

  it("vincula a música avulsa ao catálogo com apenas song_id no corpo (SETREP-01 AC2)", async () => {
    const linkedOrder = {
      ...serviceOrder,
      items: serviceOrder.items.map((item) =>
        item.id !== "it1"
          ? item
          : {
              ...item,
              setlist: {
                id: "sl1",
                songs: [
                  { id: "s1", title: "Grande é o Senhor", key: "G", bpm: 80, link: "http://x.test", sequence: 1, song_id: "cs1" },
                ],
              },
            }
      ),
    };
    let soCalls = 0;
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") return Promise.resolve({ data: instanceWithOC });
      if (url === "/celebrations/orders/so1") {
        soCalls += 1;
        return Promise.resolve({ data: soCalls === 1 ? serviceOrder : linkedOrder });
      }
      if (url === "/songs") {
        return Promise.resolve({ data: [catalogSong({ id: "cs1", title: "Digno é o Senhor" })] });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Grande é o Senhor");
    await user.click(
      screen.getByRole("button", { name: "Vincular Grande é o Senhor ao repertório" })
    );

    await user.click(await screen.findByRole("button", { name: /Digno é o Senhor/ }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/celebrations/setlists/songs/s1", { song_id: "cs1" })
    );
    // A lista reflete o vínculo pela recarga da própria ordem, sem reload de
    // página: a linha passa a oferecer desvincular (SETREP-01 AC5).
    expect(
      await screen.findByRole("button", { name: "Desvincular Grande é o Senhor do repertório" })
    ).toBeInTheDocument();
    expect(screen.getByText("Grande é o Senhor")).toBeInTheDocument();
  });

  it("desvincula a música enviando song_id nulo (SETREP-01 AC3)", async () => {
    const linkedOrder = {
      ...serviceOrder,
      items: serviceOrder.items.map((item) =>
        item.id !== "it1"
          ? item
          : {
              ...item,
              setlist: {
                id: "sl1",
                songs: [
                  { id: "s1", title: "Grande é o Senhor", key: "G", bpm: 80, link: "http://x.test", sequence: 1, song_id: "cs1" },
                ],
              },
            }
      ),
    };
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") return Promise.resolve({ data: instanceWithOC });
      if (url === "/celebrations/orders/so1") return Promise.resolve({ data: linkedOrder });
      if (url === "/songs") return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Grande é o Senhor");
    await user.click(
      screen.getByRole("button", { name: "Desvincular Grande é o Senhor do repertório" })
    );

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/celebrations/setlists/songs/s1", { song_id: null })
    );
    // Nada mais é enviado: tom, BPM e link digitados ficam como estavam.
    expect(screen.getByText("G")).toBeInTheDocument();
    expect(screen.getByText("80 BPM")).toBeInTheDocument();
  });

  it("mostra erro e preserva a lista quando o PATCH de vínculo falha", async () => {
    mockGet(true, [catalogSong({ id: "cs1", title: "Digno é o Senhor" })]);
    vi.mocked(api.patch).mockRejectedValue(new Error("fail"));
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Grande é o Senhor");
    await user.click(
      screen.getByRole("button", { name: "Vincular Grande é o Senhor ao repertório" })
    );
    await user.click(await screen.findByRole("button", { name: /Digno é o Senhor/ }));

    expect(await screen.findByText("Erro ao vincular música.")).toBeInTheDocument();
    expect(screen.getByText("Grande é o Senhor")).toBeInTheDocument();
  });

  it("cancelar o seletor de vínculo fecha sem chamar a API", async () => {
    mockGet(true, [catalogSong({ id: "cs1", title: "Digno é o Senhor" })]);
    // O mock de `patch` é compartilhado com os testes de reordenação e de
    // vínculo acima; limpar aqui deixa a asserção de "não chamou" exata.
    vi.mocked(api.patch).mockClear();
    const user = userEvent.setup();
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Grande é o Senhor");
    await user.click(
      screen.getByRole("button", { name: "Vincular Grande é o Senhor ao repertório" })
    );
    await screen.findByRole("button", { name: /Digno é o Senhor/ });

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("button", { name: /Digno é o Senhor/ })).not.toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("não oferece a ação de vincular a quem não pode adicionar músicas", async () => {
    mockGet(true);
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={false} />
    );

    await screen.findByText("Grande é o Senhor");
    expect(
      screen.queryByRole("button", { name: "Vincular Grande é o Senhor ao repertório" })
    ).not.toBeInTheDocument();
  });

  it("não oferece a ação de vincular em modo somente leitura", async () => {
    mockGet(true);
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={false} canAddSongs={true} />
    );

    await screen.findByText("Grande é o Senhor");
    expect(
      screen.queryByRole("button", { name: "Vincular Grande é o Senhor ao repertório" })
    ).not.toBeInTheDocument();
  });

  it("música vinculada mostra o indicador de repertório e as referências com rótulos distintos (SETREP-04 AC3)", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") return Promise.resolve({ data: instanceWithOC });
      if (url === "/celebrations/orders/so1") {
        return Promise.resolve({ data: orderWithSetlistSong({
          song_id: "cs1",
          song: {
            id: "cs1",
            title: "Grande é o Senhor",
            key: "G",
            key_alt: null,
            youtube_link: "http://yt.test/a",
            spotify_link: "http://spotify.test/a",
            cifra_club_link: "http://cifraclub.test/a",
          },
        }) });
      }
      if (url === "/songs") return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Grande é o Senhor");
    expect(screen.getByText("Repertório")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Abrir no YouTube: Grande é o Senhor" })
    ).toHaveAttribute("href", "http://yt.test/a");
    expect(
      screen.getByRole("link", { name: "Abrir no Spotify: Grande é o Senhor" })
    ).toHaveAttribute("href", "http://spotify.test/a");
    expect(
      screen.getByRole("link", { name: "Abrir a cifra no Cifra Club: Grande é o Senhor" })
    ).toHaveAttribute("href", "http://cifraclub.test/a");
  });

  it("música sem vínculo não mostra o indicador e oferece a ação de vincular (SETREP-04 AC4)", async () => {
    mockGet(true);
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Grande é o Senhor");
    expect(screen.queryByText("Repertório")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Vincular Grande é o Senhor ao repertório" })
    ).toBeInTheDocument();
  });

  it("referência nula renderiza os campos históricos da setlist sem erro (SETREP-04 AC2)", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") return Promise.resolve({ data: instanceWithOC });
      if (url === "/celebrations/orders/so1") {
        // `Song` removido do catálogo: `song_id` virou NULL por SetNull e a
        // referência vem nula, mas a cópia congelada continua na setlist.
        return Promise.resolve({ data: orderWithSetlistSong({ song_id: null, song: null }) });
      }
      if (url === "/songs") return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Grande é o Senhor");
    expect(screen.getByText("G")).toBeInTheDocument();
    expect(screen.getByText("80 BPM")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir link" })).toHaveAttribute("href", "http://x.test");
    expect(screen.queryByText("Repertório")).not.toBeInTheDocument();
  });

  it("mostra só as referências que a música do catálogo tem", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") return Promise.resolve({ data: instanceWithOC });
      if (url === "/celebrations/orders/so1") {
        return Promise.resolve({ data: orderWithSetlistSong({
          song_id: "cs1",
          song: {
            id: "cs1",
            title: "Grande é o Senhor",
            key: "G",
            key_alt: null,
            youtube_link: "http://yt.test/a",
            spotify_link: null,
            cifra_club_link: null,
          },
        }) });
      }
      if (url === "/songs") return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Grande é o Senhor");
    expect(
      screen.getByRole("link", { name: "Abrir no YouTube: Grande é o Senhor" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Abrir no Spotify: Grande é o Senhor" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Abrir a cifra no Cifra Club: Grande é o Senhor" })
    ).not.toBeInTheDocument();
  });

  it("o link congelado da setlist não é duplicado pelas referências do catálogo", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1") return Promise.resolve({ data: instanceWithOC });
      if (url === "/celebrations/orders/so1") {
        return Promise.resolve({ data: orderWithSetlistSong({
          song_id: "cs1",
          song: {
            id: "cs1",
            title: "Grande é o Senhor",
            key: "D",
            key_alt: null,
            youtube_link: "http://yt.test/a",
            spotify_link: null,
            cifra_club_link: "http://cifraclub.test/a",
          },
        }) });
      }
      if (url === "/songs") return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    render(
      <ServiceOrderView open={true} onOpenChange={vi.fn()} instanceId="i1" canEdit={true} canAddSongs={true} />
    );

    await screen.findByText("Grande é o Senhor");
    // O link que o líder fixou na escala aparece uma vez, com o próprio
    // rótulo; as referências do catálogo são outros três campos.
    expect(document.querySelectorAll('a[href="http://x.test"]')).toHaveLength(1);
    expect(screen.getAllByRole("link")).toHaveLength(3);
    // O tom exibido continua sendo o congelado na setlist, não o do catálogo.
    expect(screen.getByText("G")).toBeInTheDocument();
    expect(screen.queryByText("D")).not.toBeInTheDocument();
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
