import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VoluntariosPage from "./page";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), patch: vi.fn() } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

// Os quatro componentes de voluntários têm spec própria (Fase 9). Aqui
// interessa o que a tela passa a eles e o que faz com os avisos de volta.
interface NoDeMinisterio {
  id: string;
  name: string;
  children?: NoDeMinisterio[];
}

vi.mock("@/components/volunteers/MinistryTree", () => ({
  MinistryTree: ({
    nodes,
    counts,
    onSelect,
  }: {
    nodes: NoDeMinisterio[];
    counts: Record<string, { leaders: number; volunteers: number }>;
    onSelect: (id: string) => void;
  }) => {
    const achatar = (lista: NoDeMinisterio[]): NoDeMinisterio[] =>
      lista.flatMap((n) => [n, ...achatar(n.children ?? [])]);
    return (
      <div>
        {achatar(nodes).map((n) => (
          <button key={n.id} onClick={() => onSelect(n.id)}>
            {n.name} — {counts[n.id]?.leaders ?? "?"}/
            {counts[n.id]?.volunteers ?? "?"}
          </button>
        ))}
      </div>
    );
  },
}));
vi.mock("@/components/volunteers/UnavailabilityPanel", () => ({
  UnavailabilityPanel: () => <div>painel de indisponibilidade</div>,
}));
vi.mock("@/components/volunteers/CreateMinistryModal", () => ({
  CreateMinistryModal: ({
    open,
    onCreated,
  }: {
    open: boolean;
    onCreated: () => void;
  }) => (
    <div>
      <span>criar-ministerio:{open ? "aberto" : "fechado"}</span>
      <button onClick={onCreated}>avisar ministério criado</button>
    </div>
  ),
}));
vi.mock("@/components/volunteers/MinistryDetailSheet", () => ({
  MinistryDetailSheet: ({
    open,
    ministryId,
    canEdit,
    onUpdated,
    onSelectMinistry,
  }: {
    open: boolean;
    ministryId: string | null;
    canEdit: boolean;
    onUpdated: () => void;
    onSelectMinistry: (id: string) => void;
  }) => (
    <div>
      <span>sheet:{open ? ministryId : "fechada"}</span>
      <span>sheet-canEdit:{String(canEdit)}</span>
      <button onClick={onUpdated}>avisar ministério editado</button>
      <button onClick={() => onSelectMinistry("m-2")}>ir para filho</button>
    </div>
  ),
}));

const getMock = vi.mocked(api.get);
const patchMock = vi.mocked(api.patch);

const arvore = [
  {
    id: "m-1",
    name: "Louvor",
    children: [{ id: "m-2", name: "Backing vocal", children: [] }],
  },
];

function turno(overrides: Record<string, unknown> = {}) {
  return {
    id: "a-1",
    status: "pending",
    notified_at: null,
    responded_at: null,
    celebration: { id: "c-1", name: "Culto de domingo" },
    ministry: { id: "m-1", name: "Louvor" },
    scheduled_date: "2026-04-12T00:00:00.000Z",
    ...overrides,
  };
}

/** Roteia por URL: a tela faz três chamadas diferentes de GET. */
function rotear(handlers: {
  ministries?: () => unknown;
  detalhe?: (id: string) => unknown;
  turnos?: () => unknown;
}) {
  getMock.mockImplementation((url: string) => {
    if (url === "/volunteers/ministries") {
      return Promise.resolve(
        handlers.ministries?.() ?? { data: arvore }
      ) as never;
    }
    if (url.startsWith("/volunteers/ministries/")) {
      const id = url.split("/").pop()!;
      return Promise.resolve(
        handlers.detalhe?.(id) ?? { data: { leaders: [], volunteers: [] } }
      ) as never;
    }
    if (url === "/volunteers/my-celebration-assignments") {
      return Promise.resolve(handlers.turnos?.() ?? { data: [] }) as never;
    }
    throw new Error(`URL inesperada: ${url}`);
  });
}

function comPapeis(roles: string[]) {
  vi.mocked(useAuth).mockReturnValue({
    user: {
      id: "u-1",
      name: "ana",
      email: "ana@igreja.com",
      roles,
      tenant_id: "t-1",
      congregation_id: "c-1",
      support_session: false,
      support_tenant_name: null,
    },
    isLoading: false,
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

beforeEach(() => {
  getMock.mockReset();
  patchMock.mockReset().mockResolvedValue({ data: {} } as never);
  rotear({});
  comPapeis(["tenant_admin"]);
});

describe("VoluntariosPage — ministérios", () => {
  it("carrega a árvore e busca a contagem de cada ministério", async () => {
    rotear({
      detalhe: (id) => ({
        data:
          id === "m-1"
            ? { leaders: [1, 2], volunteers: [1, 2, 3] }
            : { leaders: [], volunteers: [1] },
      }),
    });

    render(<VoluntariosPage />);

    expect(await screen.findByText("2 ministérios")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Louvor — 2/3" })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Backing vocal — 0/1" })
    ).toBeInTheDocument();
  });

  it("singulariza a contagem de um ministério só", async () => {
    rotear({ ministries: () => ({ data: [{ id: "m-1", name: "Louvor", children: [] }] }) });

    render(<VoluntariosPage />);

    expect(await screen.findByText("1 ministério")).toBeInTheDocument();
  });

  it("detalhe sem listas conta zero", async () => {
    rotear({ detalhe: () => ({ data: {} }) });

    render(<VoluntariosPage />);

    expect(
      await screen.findByRole("button", { name: "Louvor — 0/0" })
    ).toBeInTheDocument();
  });

  it("falha no detalhe de um ministério não derruba a lista", async () => {
    getMock.mockImplementation((url: string) => {
      if (url === "/volunteers/ministries") return Promise.resolve({ data: arvore }) as never;
      if (url === "/volunteers/ministries/m-1") return Promise.reject(new Error("500")) as never;
      return Promise.resolve({ data: { leaders: [1], volunteers: [] } }) as never;
    });

    render(<VoluntariosPage />);

    // m-1 fica sem contagem (o mock mostra "?"), m-2 carrega.
    expect(
      await screen.findByRole("button", { name: "Louvor — ?/?" })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Backing vocal — 1/0" })
    ).toBeInTheDocument();
  });

  it("erro na árvore mostra o estado vazio com a dica de criar", async () => {
    rotear({ ministries: () => Promise.reject(new Error("500")) });
    getMock.mockImplementation((url: string) =>
      url === "/volunteers/ministries"
        ? (Promise.reject(new Error("500")) as never)
        : (Promise.resolve({ data: {} }) as never)
    );

    render(<VoluntariosPage />);

    expect(
      await screen.findByText(/Nenhum ministério cadastrado\./)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Clique em "Novo ministério" para começar\./)
    ).toBeInTheDocument();
    expect(screen.getByText("Nenhum ministério")).toBeInTheDocument();
  });

  it("quem não é admin não vê o botão de criar nem a dica", async () => {
    comPapeis(["volunteer"]);
    getMock.mockImplementation((url: string) =>
      url === "/volunteers/ministries"
        ? (Promise.resolve({ data: [] }) as never)
        : (Promise.resolve({ data: {} }) as never)
    );

    render(<VoluntariosPage />);

    expect(
      await screen.findByText(/Nenhum ministério cadastrado\./)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Clique em "Novo ministério"/)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Novo ministério/ })
    ).not.toBeInTheDocument();
    expect(screen.getByText("sheet-canEdit:false")).toBeInTheDocument();
  });

  it("sessão sem usuário resolvido também não é admin", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(<VoluntariosPage />);

    expect(await screen.findByText("sheet-canEdit:false")).toBeInTheDocument();
  });

  it("abre o modal de criar e a ficha do ministério clicado", async () => {
    const user = userEvent.setup();
    render(<VoluntariosPage />);

    await user.click(
      await screen.findByRole("button", { name: /Novo ministério/ })
    );
    expect(screen.getByText("criar-ministerio:aberto")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Louvor/ }));
    expect(screen.getByText("sheet:m-1")).toBeInTheDocument();

    // A ficha navega para um filho sem fechar.
    await user.click(screen.getByRole("button", { name: "ir para filho" }));
    expect(screen.getByText("sheet:m-2")).toBeInTheDocument();
  });

  it("montagem dupla não duplica a busca da árvore", async () => {
    // O `hasFetchedMin` existe para isso: em StrictMode o effect roda duas
    // vezes, e a segunda passagem tem que cair na guarda.
    render(
      <StrictMode>
        <VoluntariosPage />
      </StrictMode>
    );

    await screen.findByText("2 ministérios");
    expect(
      getMock.mock.calls.filter(([url]) => url === "/volunteers/ministries")
    ).toHaveLength(1);
  });

  it("criar e editar ministério refazem a busca da árvore", async () => {
    const user = userEvent.setup();
    render(<VoluntariosPage />);
    await screen.findByText("2 ministérios");

    const chamadasArvore = () =>
      getMock.mock.calls.filter(([url]) => url === "/volunteers/ministries")
        .length;
    expect(chamadasArvore()).toBe(1);

    await user.click(
      screen.getByRole("button", { name: "avisar ministério criado" })
    );
    await waitFor(() => expect(chamadasArvore()).toBe(2));

    await user.click(
      screen.getByRole("button", { name: "avisar ministério editado" })
    );
    await waitFor(() => expect(chamadasArvore()).toBe(3));
  });
});

describe("VoluntariosPage — meus turnos", () => {
  async function abrirTurnos(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByText("2 ministérios");
    await user.click(screen.getByRole("tab", { name: "Meus Turnos" }));
  }

  it("lista os turnos com celebração, ministério, data e status", async () => {
    const user = userEvent.setup();
    rotear({ turnos: () => ({ data: [turno({ status: "confirmed" })] }) });

    render(<VoluntariosPage />);
    await abrirTurnos(user);

    expect(await screen.findByText("Culto de domingo")).toBeInTheDocument();
    expect(screen.getByText("Louvor")).toBeInTheDocument();
    expect(screen.getByText("12/04/2026")).toBeInTheDocument();
    expect(screen.getByText("Confirmado")).toBeInTheDocument();
    // Já respondido: sem botões de ação.
    expect(
      screen.queryByRole("button", { name: /Confirmar/ })
    ).not.toBeInTheDocument();
  });

  it("turno recusado e status desconhecido caem no rótulo esperado", async () => {
    const user = userEvent.setup();
    rotear({
      turnos: () => ({
        data: [
          turno({ id: "a-1", status: "declined" }),
          turno({ id: "a-2", status: "expired" }),
        ],
      }),
    });

    render(<VoluntariosPage />);
    await abrirTurnos(user);

    expect(await screen.findByText("Recusou")).toBeInTheDocument();
    // Status fora do mapa aparece cru, em vez de sumir da tela.
    expect(screen.getByText("expired")).toBeInTheDocument();
  });

  it("turno sem celebração, ministério ou data mostra traços", async () => {
    const user = userEvent.setup();
    rotear({
      turnos: () => ({
        data: [
          {
            id: "a-9",
            status: "confirmed",
            notified_at: null,
            responded_at: null,
            celebration: null,
            ministry: null,
            scheduled_date: null,
          },
        ],
      }),
    });

    render(<VoluntariosPage />);
    await abrirTurnos(user);

    await waitFor(() => expect(screen.getAllByText("—")).toHaveLength(3));
  });

  it("sem turnos mostra o estado vazio", async () => {
    const user = userEvent.setup();
    render(<VoluntariosPage />);
    await abrirTurnos(user);

    expect(
      await screen.findByText("Você não tem turnos agendados.")
    ).toBeInTheDocument();
  });

  it("resposta que não é lista é tratada como vazia", async () => {
    const user = userEvent.setup();
    rotear({ turnos: () => ({ data: { message: "nada" } }) });

    render(<VoluntariosPage />);
    await abrirTurnos(user);

    expect(
      await screen.findByText("Você não tem turnos agendados.")
    ).toBeInTheDocument();
  });

  it("erro na busca avisa em vez de dizer que não há turnos", async () => {
    const user = userEvent.setup();
    getMock.mockImplementation((url: string) => {
      if (url === "/volunteers/ministries") return Promise.resolve({ data: arvore }) as never;
      if (url === "/volunteers/my-celebration-assignments")
        return Promise.reject(new Error("500")) as never;
      return Promise.resolve({ data: { leaders: [], volunteers: [] } }) as never;
    });

    render(<VoluntariosPage />);
    await abrirTurnos(user);

    expect(
      await screen.findByText("Não foi possível carregar seus turnos.")
    ).toBeInTheDocument();
  });

  it("confirmar e recusar mandam o status e atualizam o cartão", async () => {
    const user = userEvent.setup();
    rotear({
      turnos: () => ({
        data: [turno({ id: "a-1" }), turno({ id: "a-2" })],
      }),
    });

    render(<VoluntariosPage />);
    await abrirTurnos(user);

    const confirmar = await screen.findAllByRole("button", {
      name: /Confirmar/,
    });
    await user.click(confirmar[0]);

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith("/assignments/a-1/respond", {
        status: "confirmed",
      })
    );
    expect(await screen.findByText("Confirmado")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Recusar/ }));
    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith("/assignments/a-2/respond", {
        status: "declined",
      })
    );
    expect(await screen.findByText("Recusou")).toBeInTheDocument();
  });

  it("enquanto a resposta não volta os dois botões ficam travados", async () => {
    const user = userEvent.setup();
    rotear({ turnos: () => ({ data: [turno()] }) });
    let liberar!: (v: unknown) => void;
    patchMock.mockImplementation(
      () => new Promise((resolve) => (liberar = resolve)) as never
    );

    render(<VoluntariosPage />);
    await abrirTurnos(user);

    await user.click(
      await screen.findByRole("button", { name: /Confirmar/ })
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Recusar/ })).toBeDisabled()
    );

    liberar({ data: {} });
    await waitFor(() => expect(screen.getByText("Confirmado")).toBeInTheDocument());
  });

  it("falha ao responder mantém o turno pendente", async () => {
    const user = userEvent.setup();
    rotear({ turnos: () => ({ data: [turno()] }) });
    patchMock.mockRejectedValue(new Error("500"));

    render(<VoluntariosPage />);
    await abrirTurnos(user);

    await user.click(await screen.findByRole("button", { name: /Confirmar/ }));

    await waitFor(() => expect(patchMock).toHaveBeenCalled());
    expect(screen.getByText("Pendente")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Recusar/ }));
    await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Pendente")).toBeInTheDocument();
  });

  it("voltar para a aba refaz a busca", async () => {
    const user = userEvent.setup();
    rotear({ turnos: () => ({ data: [turno()] }) });

    render(<VoluntariosPage />);
    await abrirTurnos(user);
    await screen.findByText("Culto de domingo");

    const chamadasTurnos = () =>
      getMock.mock.calls.filter(
        ([url]) => url === "/volunteers/my-celebration-assignments"
      ).length;
    expect(chamadasTurnos()).toBe(1);

    await user.click(screen.getByRole("tab", { name: "Ministérios" }));
    await user.click(screen.getByRole("tab", { name: "Meus Turnos" }));

    await waitFor(() => expect(chamadasTurnos()).toBe(2));
  });
});

describe("VoluntariosPage — indisponibilidade", () => {
  it("a terceira aba monta o painel de indisponibilidade", async () => {
    const user = userEvent.setup();
    render(<VoluntariosPage />);
    await screen.findByText("2 ministérios");

    await user.click(screen.getByRole("tab", { name: "Indisponibilidade" }));

    expect(
      await screen.findByText("painel de indisponibilidade")
    ).toBeInTheDocument();
  });
});
