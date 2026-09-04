import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ConteudoPage from "./page";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

// `POST_TYPE_LABELS` mora nesse módulo e alimenta a coluna e o filtro de
// tipo — o mock troca só o componente.
vi.mock("@/components/content/CreatePostModal", async () => {
  const real = await vi.importActual<
    typeof import("@/components/content/CreatePostModal")
  >("@/components/content/CreatePostModal");
  return {
    ...real,
    CreatePostModal: ({
      open,
      onCreated,
    }: {
      open: boolean;
      onCreated: () => void;
    }) => (
      <div>
        <span>criar-post:{open ? "aberto" : "fechado"}</span>
        <button onClick={onCreated}>avisar post criado</button>
      </div>
    ),
  };
});

vi.mock("@/components/content/PostDetailSheet", () => ({
  PostDetailSheet: ({
    open,
    postId,
    canEdit,
    canDelete,
    onUpdated,
  }: {
    open: boolean;
    postId: string | null;
    canEdit: boolean;
    canDelete: boolean;
    onUpdated: () => void;
  }) => (
    <div>
      <span>post:{open ? postId : "fechado"}</span>
      <span>
        post-perm:{String(canEdit)}/{String(canDelete)}
      </span>
      <button onClick={onUpdated}>avisar post editado</button>
    </div>
  ),
}));
vi.mock("@/components/content/CreateSegmentModal", () => ({
  CreateSegmentModal: ({
    open,
    onCreated,
  }: {
    open: boolean;
    onCreated: () => void;
  }) => (
    <div>
      <span>criar-segmento:{open ? "aberto" : "fechado"}</span>
      <button onClick={onCreated}>avisar segmento criado</button>
    </div>
  ),
}));
vi.mock("@/components/content/SendNotificationModal", () => ({
  SendNotificationModal: ({
    open,
    onSent,
  }: {
    open: boolean;
    onSent: (r: { delivered?: number }) => void;
  }) => (
    <div>
      <span>notificar:{open ? "aberto" : "fechado"}</span>
      <button onClick={() => onSent({ delivered: 120 })}>
        avisar envio com entrega
      </button>
      <button onClick={() => onSent({})}>avisar envio sem métrica</button>
    </div>
  ),
}));

const getMock = vi.mocked(api.get);

function post(overrides: Record<string, unknown> = {}) {
  return {
    id: "p-1",
    title: "Aviso da semana",
    type: "announcement",
    is_draft: false,
    publish_at: "2026-08-01T12:00:00.000Z",
    created_at: "2026-07-30T12:00:00.000Z",
    media_url: null,
    ...overrides,
  };
}

function segmento(overrides: Record<string, unknown> = {}) {
  return {
    id: "s-1",
    name: "Jovens",
    criteria: undefined,
    _count: { posts: 4 },
    ...overrides,
  };
}

function rotear(handlers: { posts?: () => unknown; segmentos?: () => unknown }) {
  getMock.mockImplementation((url: string) => {
    if (url.startsWith("/content/posts")) {
      return Promise.resolve(handlers.posts?.() ?? { data: [post()] }) as never;
    }
    if (url.startsWith("/content/segments")) {
      return Promise.resolve(
        handlers.segmentos?.() ?? { data: [segmento()] }
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

function urlDePosts() {
  return getMock.mock.calls
    .map(([url]) => url as string)
    .filter((url) => url.startsWith("/content/posts"))
    .at(-1)!;
}

beforeEach(() => {
  getMock.mockReset();
  rotear({});
  comPapeis(["tenant_admin"]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ConteudoPage — aba Posts", () => {
  it("busca com limite de 50 e mostra título, tipo, data e status", async () => {
    render(<ConteudoPage />);

    expect(await screen.findByText("Aviso da semana")).toBeInTheDocument();
    expect(urlDePosts()).toBe("/content/posts?limit=50");
    expect(screen.getByText("Aviso")).toBeInTheDocument();
    // A data exibida é a de publicação, não a de criação.
    expect(screen.getByText("01/08/2026")).toBeInTheDocument();
    expect(screen.getByText("Publicado")).toBeInTheDocument();
  });

  it("deriva rascunho, agendado e publicado", async () => {
    const futuro = new Date(Date.now() + 86_400_000).toISOString();
    rotear({
      posts: () => ({
        data: [
          post({ id: "p-1", title: "Um", is_draft: true }),
          post({ id: "p-2", title: "Dois", publish_at: futuro }),
          post({ id: "p-3", title: "Três" }),
        ],
      }),
    });

    render(<ConteudoPage />);

    const tabela = await screen.findByRole("table");
    // Rascunho vence o agendamento: `is_draft` é decidido antes da data.
    expect(within(tabela).getByText("Rascunho")).toBeInTheDocument();
    expect(within(tabela).getByText("Agendado")).toBeInTheDocument();
    expect(within(tabela).getByText("Publicado")).toBeInTheDocument();
  });

  it("post sem publish_at cai na data de criação", async () => {
    rotear({ posts: () => ({ data: [post({ publish_at: null })] }) });

    render(<ConteudoPage />);

    expect(await screen.findByText("30/07/2026")).toBeInTheDocument();
  });

  it("post com anexo mostra o clipe, e tipo desconhecido aparece cru", async () => {
    rotear({
      posts: () => ({
        data: [post({ media_url: "https://cdn/x.pdf", type: "livestream" })],
      }),
    });

    render(<ConteudoPage />);

    expect(
      await screen.findByLabelText("Possui arquivo anexado")
    ).toBeInTheDocument();
    expect(screen.getByText("livestream")).toBeInTheDocument();
  });

  it("aceita resposta paginada e resposta em lista", async () => {
    rotear({ posts: () => ({ data: { data: [post({ title: "Paginado" })] } }) });
    const { unmount } = render(<ConteudoPage />);
    expect(await screen.findByText("Paginado")).toBeInTheDocument();
    unmount();

    rotear({ posts: () => ({ data: [post({ title: "Em lista" })] }) });
    render(<ConteudoPage />);
    expect(await screen.findByText("Em lista")).toBeInTheDocument();
  });

  it("resposta paginada sem `data` e erro caem no estado vazio", async () => {
    rotear({ posts: () => ({ data: {} }) });
    const { unmount } = render(<ConteudoPage />);
    expect(
      await screen.findByText("Nenhum post encontrado.")
    ).toBeInTheDocument();
    unmount();

    rotear({ posts: () => Promise.reject(new Error("500")) });
    render(<ConteudoPage />);
    expect(
      await screen.findByText("Nenhum post encontrado.")
    ).toBeInTheDocument();
  });

  it("filtro de tipo vira parâmetro da consulta", async () => {
    const user = userEvent.setup();
    render(<ConteudoPage />);
    await screen.findByText("Aviso da semana");

    await user.selectOptions(screen.getAllByRole("combobox")[0], "devotional");

    await waitFor(() => expect(urlDePosts()).toContain("type=devotional"));
  });

  it("rascunho e publicado viram is_draft; agendado é filtrado no cliente", async () => {
    const user = userEvent.setup();
    const futuro = new Date(Date.now() + 86_400_000).toISOString();
    rotear({
      posts: () => ({
        data: [
          post({ id: "p-1", title: "Já publicado" }),
          post({ id: "p-2", title: "Ainda vai sair", publish_at: futuro }),
        ],
      }),
    });

    render(<ConteudoPage />);
    await screen.findByText("Já publicado");
    const status = screen.getAllByRole("combobox")[1];

    await user.selectOptions(status, "draft");
    await waitFor(() => expect(urlDePosts()).toContain("is_draft=true"));

    await user.selectOptions(status, "published");
    await waitFor(() => expect(urlDePosts()).toContain("is_draft=false"));

    // "Agendados" não vai para a API: a lista é filtrada aqui.
    await user.selectOptions(status, "scheduled");
    await waitFor(() => expect(urlDePosts()).not.toContain("is_draft"));
    expect(await screen.findByText("Ainda vai sair")).toBeInTheDocument();
    expect(screen.queryByText("Já publicado")).not.toBeInTheDocument();
  });

  it("clique na linha abre a ficha do post", async () => {
    const user = userEvent.setup();
    render(<ConteudoPage />);

    await user.click(await screen.findByText("Aviso da semana"));

    expect(screen.getByText("post:p-1")).toBeInTheDocument();
  });

  it("criar e editar post refazem a busca", async () => {
    const user = userEvent.setup();
    render(<ConteudoPage />);
    await screen.findByText("Aviso da semana");

    const chamadas = () =>
      getMock.mock.calls.filter(([url]) =>
        (url as string).startsWith("/content/posts")
      ).length;
    expect(chamadas()).toBe(1);

    await user.click(screen.getByRole("button", { name: "avisar post criado" }));
    await waitFor(() => expect(chamadas()).toBe(2));

    await user.click(
      screen.getByRole("button", { name: "avisar post editado" })
    );
    await waitFor(() => expect(chamadas()).toBe(3));
  });

  it("abre o modal de novo post", async () => {
    const user = userEvent.setup();
    render(<ConteudoPage />);
    await screen.findByText("Aviso da semana");

    await user.click(screen.getByRole("button", { name: /Novo post/ }));

    expect(screen.getByText("criar-post:aberto")).toBeInTheDocument();
  });

  it("pastor edita mas não apaga; quem não edita não vê os botões", async () => {
    comPapeis(["pastor"]);
    const { unmount } = render(<ConteudoPage />);
    await screen.findByText("Aviso da semana");
    expect(screen.getByText("post-perm:true/false")).toBeInTheDocument();
    unmount();

    comPapeis(["member"]);
    render(<ConteudoPage />);
    await screen.findByText("Aviso da semana");
    expect(screen.getByText("post-perm:false/false")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Novo post/ })
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

    render(<ConteudoPage />);

    await screen.findByText("Aviso da semana");
    expect(screen.getByText("post-perm:false/false")).toBeInTheDocument();
  });
});

describe("ConteudoPage — aba Segmentos", () => {
  async function abrirSegmentos(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByText("Aviso da semana");
    await user.click(screen.getByRole("tab", { name: "Segmentos" }));
  }

  it("lista os segmentos com critérios e contagem de posts", async () => {
    const user = userEvent.setup();
    render(<ConteudoPage />);
    await abrirSegmentos(user);

    expect(await screen.findByText("Jovens")).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith("/content/segments?limit=100");
    expect(screen.getByText("1 segmento")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    // Sem critérios: alcança todos.
    expect(screen.getByText("Todos")).toBeInTheDocument();
  });

  it("resume cada tipo de critério", async () => {
    const user = userEvent.setup();
    rotear({
      segmentos: () => ({
        data: [
          segmento({
            id: "s-1",
            name: "Combinado",
            criteria: {
              group_ids: ["g1", "g2"],
              ministry_ids: ["m1"],
              roles: ["pastor", "member"],
              min_age: 18,
              max_age: 30,
            },
          }),
          segmento({
            id: "s-2",
            name: "Só idade mínima",
            criteria: { min_age: 60 },
            _count: undefined,
          }),
          segmento({
            id: "s-3",
            name: "Só idade máxima",
            criteria: { max_age: 12 },
          }),
          segmento({ id: "s-4", name: "Critério vazio", criteria: {} }),
        ],
      }),
    });

    render(<ConteudoPage />);
    await abrirSegmentos(user);

    expect(
      await screen.findByText(
        "2 grupo(s) · 1 ministério(s) · pastor, member · 18–30 anos"
      )
    ).toBeInTheDocument();
    expect(screen.getByText("60–∞ anos")).toBeInTheDocument();
    expect(screen.getByText("0–12 anos")).toBeInTheDocument();
    // Critério presente mas sem nenhuma regra também é "Todos".
    expect(screen.getAllByText("Todos")).toHaveLength(1);
    // Sem `_count`: traço.
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("pluraliza a contagem de segmentos", async () => {
    const user = userEvent.setup();
    rotear({
      segmentos: () => ({
        data: [segmento(), segmento({ id: "s-2", name: "Casais" })],
      }),
    });

    render(<ConteudoPage />);
    await abrirSegmentos(user);

    expect(await screen.findByText("2 segmentos")).toBeInTheDocument();
  });

  it("aceita resposta paginada, resposta sem data e erro", async () => {
    const user = userEvent.setup();
    rotear({ segmentos: () => ({ data: { data: [segmento({ name: "Paginado" })] } }) });
    const { unmount } = render(<ConteudoPage />);
    await abrirSegmentos(user);
    expect(await screen.findByText("Paginado")).toBeInTheDocument();
    unmount();

    rotear({ segmentos: () => ({ data: {} }) });
    const segunda = render(<ConteudoPage />);
    await abrirSegmentos(user);
    expect(
      await screen.findByText("Nenhum segmento cadastrado.")
    ).toBeInTheDocument();
    segunda.unmount();

    rotear({ segmentos: () => Promise.reject(new Error("500")) });
    render(<ConteudoPage />);
    await abrirSegmentos(user);
    expect(
      await screen.findByText("Nenhum segmento cadastrado.")
    ).toBeInTheDocument();
    expect(screen.getByText("Nenhum segmento")).toBeInTheDocument();
  });

  it("abre o modal de segmento pelo cabeçalho e pelo estado vazio", async () => {
    const user = userEvent.setup();
    rotear({ segmentos: () => ({ data: [] }) });
    render(<ConteudoPage />);
    await abrirSegmentos(user);

    await user.click(
      await screen.findByRole("button", { name: "Criar primeiro segmento" })
    );
    expect(screen.getByText("criar-segmento:aberto")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Novo segmento/ }));
    expect(screen.getByText("criar-segmento:aberto")).toBeInTheDocument();
  });

  it("criar segmento refaz a busca", async () => {
    const user = userEvent.setup();
    render(<ConteudoPage />);
    await abrirSegmentos(user);
    await screen.findByText("Jovens");

    const chamadas = () =>
      getMock.mock.calls.filter(([url]) =>
        (url as string).startsWith("/content/segments")
      ).length;
    expect(chamadas()).toBe(1);

    await user.click(
      screen.getByRole("button", { name: "avisar segmento criado" })
    );

    await waitFor(() => expect(chamadas()).toBe(2));
  });

  it("voltar para a aba refaz a busca", async () => {
    const user = userEvent.setup();
    render(<ConteudoPage />);
    await abrirSegmentos(user);
    await screen.findByText("Jovens");

    await user.click(screen.getByRole("tab", { name: "Posts" }));
    await user.click(screen.getByRole("tab", { name: "Segmentos" }));

    await waitFor(() =>
      expect(
        getMock.mock.calls.filter(([url]) =>
          (url as string).startsWith("/content/segments")
        ).length
      ).toBe(2)
    );
  });

  it("quem não gerencia segmentos não vê botão nenhum", async () => {
    const user = userEvent.setup();
    comPapeis(["member"]);
    rotear({ segmentos: () => ({ data: [] }) });

    render(<ConteudoPage />);
    await abrirSegmentos(user);

    expect(
      await screen.findByText("Nenhum segmento cadastrado.")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Novo segmento/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Criar primeiro segmento" })
    ).not.toBeInTheDocument();
  });
});

describe("ConteudoPage — aba Notificações", () => {
  async function abrirNotificacoes(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByText("Aviso da semana");
    await user.click(screen.getByRole("tab", { name: "Notificações" }));
  }

  it("começa sem histórico e explica que ele é da sessão", async () => {
    const user = userEvent.setup();
    render(<ConteudoPage />);
    await abrirNotificacoes(user);

    expect(
      await screen.findByText("Nenhuma notificação enviada nesta sessão.")
    ).toBeInTheDocument();
  });

  it("registra o envio com a métrica de entrega", async () => {
    const user = userEvent.setup();
    render(<ConteudoPage />);
    await abrirNotificacoes(user);

    await user.click(
      screen.getByRole("button", { name: "avisar envio com entrega" })
    );

    const painel = screen.getByRole("tabpanel");
    expect(
      await within(painel).findByText("Notificação manual")
    ).toBeInTheDocument();
    expect(within(painel).getByText("120 entregue(s)")).toBeInTheDocument();
    // Sem `opened`, não há taxa de abertura.
    expect(within(painel).queryByText(/% abertura/)).not.toBeInTheDocument();
  });

  it("envio sem métrica aparece no histórico sem números", async () => {
    const user = userEvent.setup();
    render(<ConteudoPage />);
    await abrirNotificacoes(user);

    await user.click(
      screen.getByRole("button", { name: "avisar envio sem métrica" })
    );

    const painel = screen.getByRole("tabpanel");
    expect(
      await within(painel).findByText("Notificação manual")
    ).toBeInTheDocument();
    expect(within(painel).queryByText(/entregue/)).not.toBeInTheDocument();
    expect(within(painel).queryByText(/aberto/)).not.toBeInTheDocument();
  });

  it("abre o modal de envio", async () => {
    const user = userEvent.setup();
    render(<ConteudoPage />);
    await abrirNotificacoes(user);

    await user.click(screen.getByRole("button", { name: /Enviar notificação/ }));

    expect(screen.getByText("notificar:aberto")).toBeInTheDocument();
  });

  it("quem não pode notificar não vê o botão", async () => {
    const user = userEvent.setup();
    comPapeis(["member"]);

    render(<ConteudoPage />);
    await abrirNotificacoes(user);

    expect(
      await screen.findByText("Nenhuma notificação enviada nesta sessão.")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Enviar notificação/ })
    ).not.toBeInTheDocument();
  });
});
