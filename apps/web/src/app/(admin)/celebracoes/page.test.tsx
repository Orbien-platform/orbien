import { StrictMode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CelebracoesPage from "./page";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

// `RECURRENCE_LABELS` e `WEEKDAY_LABELS` moram nesse módulo e a tela os usa
// nas colunas — o mock troca só o componente.
vi.mock("@/components/celebrations/CreateCelebrationModal", async () => {
  const real = await vi.importActual<
    typeof import("@/components/celebrations/CreateCelebrationModal")
  >("@/components/celebrations/CreateCelebrationModal");
  return {
    ...real,
    CreateCelebrationModal: ({
      open,
      onCreated,
    }: {
      open: boolean;
      onCreated: () => void;
    }) => (
      <div>
        <span>criar:{open ? "aberto" : "fechado"}</span>
        <button onClick={onCreated}>avisar celebração criada</button>
      </div>
    ),
  };
});

vi.mock("@/components/celebrations/CelebrationDetailSheet", () => ({
  CelebrationDetailSheet: ({
    open,
    celebrationId,
    canEdit,
    canAddSongs,
  }: {
    open: boolean;
    celebrationId: string | null;
    canEdit: boolean;
    canAddSongs: boolean;
  }) => (
    <div>
      <span>detalhe:{open ? celebrationId : "fechado"}</span>
      <span>
        detalhe-perm:{String(canEdit)}/{String(canAddSongs)}
      </span>
    </div>
  ),
}));
vi.mock("@/components/celebrations/ServiceOrderView", () => ({
  ServiceOrderView: ({
    open,
    instanceId,
  }: {
    open: boolean;
    instanceId: string | null;
  }) => <span>oc:{open ? instanceId : "fechada"}</span>,
}));
vi.mock("@/components/celebrations/ScheduleSheet", () => ({
  ScheduleSheet: ({
    open,
    instanceId,
    celebrationName,
    scheduledDate,
    onChanged,
  }: {
    open: boolean;
    instanceId: string | null;
    celebrationName: string;
    scheduledDate: string;
    onChanged: () => void;
  }) => (
    <div>
      <span>
        escala:{open ? instanceId : "fechada"}|{celebrationName}|{scheduledDate}
      </span>
      <button onClick={onChanged}>avisar escala alterada</button>
    </div>
  ),
}));
vi.mock("@/components/celebrations/TemplatesPanel", () => ({
  TemplatesPanel: ({ canEdit }: { canEdit: boolean }) => (
    <div>painel de templates:{String(canEdit)}</div>
  ),
}));

const getMock = vi.mocked(api.get);

function celebracao(overrides: Record<string, unknown> = {}) {
  return {
    id: "c-1",
    name: "Culto de domingo",
    day_of_week: 0,
    start_time: "19:00",
    recurrence: "weekly",
    ...overrides,
  };
}

function instancia(overrides: Record<string, unknown> = {}) {
  return {
    id: "i-1",
    scheduled_date: "2026-09-13T00:00:00.000Z",
    celebration: { id: "c-1", name: "Culto de domingo" },
    serviceOrder: { id: "so-1" },
    schedule: { id: "s-1", status: "published" },
    ...overrides,
  };
}

function rotear(handlers: {
  celebracoes?: () => unknown;
  instancias?: () => unknown;
}) {
  getMock.mockImplementation((url: string) => {
    if (url === "/celebrations") {
      return Promise.resolve(
        handlers.celebracoes?.() ?? { data: [celebracao()] }
      ) as never;
    }
    if (url.startsWith("/celebrations/instances")) {
      return Promise.resolve(
        handlers.instancias?.() ?? { data: [instancia()] }
      ) as never;
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
  rotear({});
  comPapeis(["tenant_admin"]);
});

describe("CelebracoesPage — aba Celebrações", () => {
  it("lista as celebrações com dia, horário e recorrência", async () => {
    render(<CelebracoesPage />);

    expect(await screen.findByText("Culto de domingo")).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith("/celebrations");
    expect(screen.getByText("Domingo · 19:00")).toBeInTheDocument();
    expect(screen.getByText("Semanal")).toBeInTheDocument();
    expect(screen.getByText("1 celebração")).toBeInTheDocument();
  });

  it("pluraliza a contagem", async () => {
    rotear({
      celebracoes: () => ({
        data: [celebracao(), celebracao({ id: "c-2", name: "Culto de quarta" })],
      }),
    });

    render(<CelebracoesPage />);

    expect(await screen.findByText("2 celebrações")).toBeInTheDocument();
  });

  it("celebração sem dia da semana, sem horário e com recorrência desconhecida", async () => {
    rotear({
      celebracoes: () => ({
        data: [
          celebracao({
            id: "c-9",
            name: "Avulsa",
            day_of_week: null,
            start_time: "",
            recurrence: "",
          }),
          celebracao({
            id: "c-8",
            name: "Estranha",
            day_of_week: null,
            start_time: "08:00",
            recurrence: "bimestral",
          }),
        ],
      }),
    });

    render(<CelebracoesPage />);

    await screen.findByText("Avulsa");
    // Sem dia e sem hora: traço no lugar do horário; recorrência vazia idem.
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getByText("08:00")).toBeInTheDocument();
    // Recorrência fora do mapa aparece crua.
    expect(screen.getByText("bimestral")).toBeInTheDocument();
  });

  it("resposta que não é lista vira lista vazia", async () => {
    rotear({ celebracoes: () => ({ data: { message: "nada" } }) });

    render(<CelebracoesPage />);

    expect(
      await screen.findByText("Nenhuma celebração cadastrada.")
    ).toBeInTheDocument();
    expect(screen.getByText("Nenhuma celebração")).toBeInTheDocument();
  });

  it("erro na busca esvazia a lista", async () => {
    rotear({ celebracoes: () => Promise.reject(new Error("500")) });

    render(<CelebracoesPage />);

    expect(
      await screen.findByText("Nenhuma celebração cadastrada.")
    ).toBeInTheDocument();
  });

  it("montagem dupla não duplica a busca", async () => {
    render(
      <StrictMode>
        <CelebracoesPage />
      </StrictMode>
    );

    await screen.findByText("Culto de domingo");
    expect(
      getMock.mock.calls.filter(([url]) => url === "/celebrations")
    ).toHaveLength(1);
  });

  it("clique na linha abre a ficha da celebração", async () => {
    const user = userEvent.setup();
    render(<CelebracoesPage />);

    await user.click(await screen.findByText("Culto de domingo"));

    expect(screen.getByText("detalhe:c-1")).toBeInTheDocument();
  });

  it("abre o modal de criar pelo cabeçalho e pelo estado vazio", async () => {
    const user = userEvent.setup();
    rotear({ celebracoes: () => ({ data: [] }) });
    render(<CelebracoesPage />);

    await screen.findByText("Nenhuma celebração cadastrada.");
    // Um botão no cabeçalho, outro dentro do estado vazio.
    const botoes = screen.getAllByRole("button", { name: /Nova celebração/ });
    expect(botoes).toHaveLength(2);

    await user.click(botoes[1]);
    expect(screen.getByText("criar:aberto")).toBeInTheDocument();

    // E o do cabeçalho abre o mesmo modal.
    await user.click(botoes[0]);
    expect(screen.getByText("criar:aberto")).toBeInTheDocument();
  });

  it("criar celebração refaz a busca", async () => {
    const user = userEvent.setup();
    render(<CelebracoesPage />);
    await screen.findByText("Culto de domingo");

    await user.click(
      screen.getByRole("button", { name: "avisar celebração criada" })
    );

    await waitFor(() =>
      expect(
        getMock.mock.calls.filter(([url]) => url === "/celebrations")
      ).toHaveLength(2)
    );
  });

  it("papéis definem edição e inclusão de músicas", async () => {
    comPapeis(["ministry_leader"]);
    render(<CelebracoesPage />);

    await screen.findByText("Culto de domingo");
    expect(screen.getByText("detalhe-perm:false/true")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Nova celebração/ })
    ).not.toBeInTheDocument();
  });

  it("sessão sem usuário resolvido não libera nada", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(<CelebracoesPage />);

    await screen.findByText("Culto de domingo");
    expect(screen.getByText("detalhe-perm:false/false")).toBeInTheDocument();
  });
});

describe("CelebracoesPage — aba Próximas", () => {
  async function abrirProximas(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByText("Culto de domingo");
    await user.click(screen.getByRole("tab", { name: "Próximas" }));
  }

  it("busca as instâncias a partir de hoje, ordena e mostra data com horário", async () => {
    const user = userEvent.setup();
    rotear({
      instancias: () => ({
        data: [
          instancia({ id: "i-2", scheduled_date: "2026-09-20T00:00:00.000Z" }),
          instancia({ id: "i-1", scheduled_date: "2026-09-13T00:00:00.000Z" }),
        ],
      }),
    });

    render(<CelebracoesPage />);
    await abrirProximas(user);

    const cartoes = await screen.findAllByText(/Culto de domingo/);
    expect(cartoes.length).toBeGreaterThan(0);
    const urlInstancias = getMock.mock.calls
      .map(([url]) => url as string)
      .find((url) => url.startsWith("/celebrations/instances"));
    expect(urlInstancias).toMatch(/^\/celebrations\/instances\?date_from=\d{4}-\d{2}-\d{2}$/);

    // Ordem crescente por data; o horário vem da celebração correspondente.
    const datas = screen.getAllByText(/· 19:00$/).map((el) => el.textContent);
    expect(datas[0]).toContain("13/09/2026");
    expect(datas[1]).toContain("20/09/2026");
  });

  it("corta em 30 instâncias", async () => {
    const user = userEvent.setup();
    rotear({
      instancias: () => ({
        data: Array.from({ length: 42 }, (_, i) =>
          instancia({
            id: `i-${i}`,
            scheduled_date: `2026-09-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
          })
        ),
      }),
    });

    render(<CelebracoesPage />);
    await abrirProximas(user);

    await waitFor(() =>
      expect(screen.getAllByText("Com OC")).toHaveLength(30)
    );
  });

  it("mostra os quatro estados possíveis do badge de escala", async () => {
    const user = userEvent.setup();
    rotear({
      instancias: () => ({
        data: [
          instancia({ id: "i-1", schedule: { id: "s", status: "published" } }),
          instancia({ id: "i-2", schedule: { id: "s", status: "archived" } }),
          instancia({ id: "i-3", schedule: { id: "s", status: "draft" } }),
          instancia({ id: "i-4", schedule: null }),
          // API anterior ao refactor: o campo não vem.
          instancia({ id: "i-5", schedule: undefined, serviceOrder: null }),
        ],
      }),
    });

    render(<CelebracoesPage />);
    await abrirProximas(user);

    expect(await screen.findByText("Escala publicada")).toBeInTheDocument();
    expect(screen.getByText("Escala arquivada")).toBeInTheDocument();
    expect(screen.getByText("Escala rascunho")).toBeInTheDocument();
    expect(screen.getByText("Sem escala")).toBeInTheDocument();
    expect(screen.getByText("Escala")).toBeInTheDocument();
    expect(screen.getByText("Sem OC")).toBeInTheDocument();
  });

  it("instância de celebração desconhecida não mostra horário", async () => {
    const user = userEvent.setup();
    rotear({
      instancias: () => ({
        data: [
          instancia({
            celebration: { id: "c-999", name: "Evento avulso" },
          }),
        ],
      }),
    });

    render(<CelebracoesPage />);
    await abrirProximas(user);

    expect(await screen.findByText("Evento avulso")).toBeInTheDocument();
    expect(screen.queryByText(/· 19:00$/)).not.toBeInTheDocument();
  });

  it("sem instâncias explica de onde elas vêm", async () => {
    const user = userEvent.setup();
    rotear({ instancias: () => ({ data: [] }) });

    render(<CelebracoesPage />);
    await abrirProximas(user);

    expect(
      await screen.findByText("Nenhuma instância próxima encontrada.")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/geradas automaticamente com base nas celebrações/)
    ).toBeInTheDocument();
  });

  it("resposta que não é lista e erro caem no mesmo estado vazio", async () => {
    const user = userEvent.setup();
    rotear({ instancias: () => ({ data: { message: "nada" } }) });

    const { unmount } = render(<CelebracoesPage />);
    await abrirProximas(user);
    expect(
      await screen.findByText("Nenhuma instância próxima encontrada.")
    ).toBeInTheDocument();
    unmount();

    rotear({ instancias: () => Promise.reject(new Error("500")) });
    render(<CelebracoesPage />);
    await abrirProximas(user);
    expect(
      await screen.findByText("Nenhuma instância próxima encontrada.")
    ).toBeInTheDocument();
  });

  it("clique no cartão abre a ordem de culto e o badge abre a escala", async () => {
    const user = userEvent.setup();
    render(<CelebracoesPage />);
    await abrirProximas(user);

    await user.click(
      await screen.findByRole("button", { name: /Culto de domingo/ })
    );
    expect(screen.getByText("oc:i-1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Escala publicada" }));
    expect(
      screen.getByText("escala:i-1|Culto de domingo|2026-09-13T00:00:00.000Z")
    ).toBeInTheDocument();
  });

  it("alterar a escala refaz a busca das instâncias", async () => {
    const user = userEvent.setup();
    render(<CelebracoesPage />);
    await abrirProximas(user);
    await screen.findByText("Escala publicada");

    const chamadas = () =>
      getMock.mock.calls.filter(([url]) =>
        (url as string).startsWith("/celebrations/instances")
      ).length;
    expect(chamadas()).toBe(1);

    await user.click(
      screen.getByRole("button", { name: "avisar escala alterada" })
    );

    await waitFor(() => expect(chamadas()).toBe(2));
  });

  it("voltar para a aba refaz a busca", async () => {
    const user = userEvent.setup();
    render(<CelebracoesPage />);
    await abrirProximas(user);
    await screen.findByText("Escala publicada");

    await user.click(screen.getByRole("tab", { name: "Celebrações" }));
    await user.click(screen.getByRole("tab", { name: "Próximas" }));

    await waitFor(() =>
      expect(
        getMock.mock.calls.filter(([url]) =>
          (url as string).startsWith("/celebrations/instances")
        ).length
      ).toBe(2)
    );
  });
});

describe("CelebracoesPage — aba Templates", () => {
  it("monta o painel de templates com a permissão de edição", async () => {
    const user = userEvent.setup();
    render(<CelebracoesPage />);
    await screen.findByText("Culto de domingo");

    await user.click(screen.getByRole("tab", { name: "Templates" }));

    expect(
      await within(screen.getByRole("tabpanel")).findByText(
        "painel de templates:true"
      )
    ).toBeInTheDocument();
  });
});
