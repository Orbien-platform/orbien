import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import ConteudoPage from "./page";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn() },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

vi.mock("@/components/content/CreatePostModal", () => ({
  POST_TYPE_LABELS: {
    post: "Post",
    sermon_video: "Vídeo Sermão",
    audio: "Áudio",
    devotional: "Devocional",
    study: "Estudo",
    event: "Evento",
    notice: "Aviso",
    prayer: "Oração",
  },
  CreatePostModal: ({ open, onCreated }: { open: boolean; onCreated: () => void }) =>
    open ? (
      <div data-testid="create-post-modal">
        <button onClick={onCreated}>simular criação</button>
      </div>
    ) : null,
}));
vi.mock("@/components/content/PostDetailSheet", () => ({
  PostDetailSheet: ({
    open,
    postId,
    onUpdated,
  }: {
    open: boolean;
    postId: string | null;
    onUpdated: () => void;
  }) =>
    open ? (
      <div data-testid="post-detail-sheet">
        post:{postId}
        <button onClick={onUpdated}>simular atualização</button>
      </div>
    ) : null,
}));
vi.mock("@/components/content/CreateSegmentModal", () => ({
  CreateSegmentModal: ({ open, onCreated }: { open: boolean; onCreated: () => void }) =>
    open ? (
      <div data-testid="create-segment-modal">
        <button onClick={onCreated}>simular criação de segmento</button>
      </div>
    ) : null,
}));
vi.mock("@/components/content/SendNotificationModal", () => ({
  SendNotificationModal: ({
    open,
    onSent,
  }: {
    open: boolean;
    onSent: (result: { delivered: number }) => void;
  }) =>
    open ? (
      <div data-testid="send-notification-modal">
        <button onClick={() => onSent({ delivered: 42 })}>simular envio</button>
      </div>
    ) : null,
}));

const mockedApi = vi.mocked(api, true);
const mockedUseAuth = vi.mocked(useAuth);

function setup(roles: string[] = ["tenant_admin"]) {
  mockedUseAuth.mockReturnValue({
    user: {
      id: "u1",
      name: "Ana",
      email: "ana@a.com",
      roles,
      tenant_id: "t1",
      congregation_id: "c1",
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
  vi.clearAllMocks();
});

describe("ConteudoPage", () => {
  it("carrega e mostra a lista de posts com status derivado", async () => {
    setup();
    mockedApi.get.mockResolvedValue({
      data: [
        { id: "1", title: "Rascunho", type: "post", is_draft: true, created_at: "2026-01-01T00:00:00Z" },
        {
          id: "2",
          title: "Agendado",
          type: "event",
          is_draft: false,
          publish_at: "2999-01-01T00:00:00Z",
          created_at: "2026-01-01T00:00:00Z",
          media_url: "https://x/y.png",
        },
        { id: "3", title: "Publicado", type: "post", is_draft: false, created_at: "2026-01-01T00:00:00Z" },
      ],
    });
    render(<ConteudoPage />);
    expect((await screen.findAllByText("Rascunho")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Agendado").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Publicado").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByLabelText("Possui arquivo anexado")
    ).toBeInTheDocument();
  });

  it("aceita resposta paginada ({data: []}) além de array puro, e trata falha como lista vazia", async () => {
    setup();
    mockedApi.get.mockResolvedValueOnce({ data: { data: [{ id: "1", title: "Do Envelope", type: "post", is_draft: false, created_at: "2026-01-01T00:00:00Z" }] } });
    const { unmount } = render(<ConteudoPage />);
    expect(await screen.findByText("Do Envelope")).toBeInTheDocument();
    unmount();

    mockedApi.get.mockRejectedValue(new Error("boom"));
    render(<ConteudoPage />);
    expect(await screen.findByText("Nenhum post encontrado.")).toBeInTheDocument();
  });

  it("filtra por tipo e por status, disparando novas requisições", async () => {
    setup();
    mockedApi.get.mockResolvedValue({ data: [] });
    const user = userEvent.setup();
    render(<ConteudoPage />);
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledTimes(1));

    await user.selectOptions(screen.getByDisplayValue("Todos os tipos"), "event");
    await waitFor(() =>
      expect(mockedApi.get).toHaveBeenLastCalledWith(expect.stringContaining("type=event"))
    );

    await user.selectOptions(screen.getByDisplayValue("Todos os status"), "draft");
    await waitFor(() =>
      expect(mockedApi.get).toHaveBeenLastCalledWith(expect.stringContaining("is_draft=true"))
    );

    await user.selectOptions(screen.getByDisplayValue("Rascunhos"), "published");
    await waitFor(() =>
      expect(mockedApi.get).toHaveBeenLastCalledWith(expect.stringContaining("is_draft=false"))
    );

    await user.selectOptions(screen.getByDisplayValue("Publicados"), "scheduled");
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledTimes(5));
  });

  it("filtra 'agendados' no cliente a partir de publish_at futuro", async () => {
    setup();
    mockedApi.get.mockResolvedValue({
      data: [
        { id: "1", title: "Futuro", type: "post", is_draft: false, publish_at: "2999-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" },
        { id: "2", title: "Já Publicado", type: "post", is_draft: false, created_at: "2026-01-01T00:00:00Z" },
      ],
    });
    const user = userEvent.setup();
    render(<ConteudoPage />);
    await screen.findByText("Futuro");
    await user.selectOptions(screen.getByDisplayValue("Todos os status"), "scheduled");
    await waitFor(() => expect(screen.queryByText("Já Publicado")).not.toBeInTheDocument());
    expect(screen.getByText("Futuro")).toBeInTheDocument();
  });

  it("mostra rótulo cru quando o tipo do post não está no dicionário", async () => {
    setup();
    mockedApi.get.mockResolvedValue({
      data: [{ id: "1", title: "Tipo Estranho", type: "custom_x", is_draft: false, created_at: "2026-01-01T00:00:00Z" }],
    });
    render(<ConteudoPage />);
    await screen.findByText("Tipo Estranho");
    expect(screen.getByText("custom_x")).toBeInTheDocument();
  });

  it("abre modal de criação de post, o sheet de detalhe e recarrega ao concluir", async () => {
    setup();
    mockedApi.get.mockResolvedValue({ data: [] });
    const user = userEvent.setup();
    render(<ConteudoPage />);
    await screen.findByText("Nenhum post encontrado.");

    await user.click(screen.getByRole("button", { name: /novo post/i }));
    expect(screen.getByTestId("create-post-modal")).toBeInTheDocument();
    const callsBefore = mockedApi.get.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "simular criação" }));
    await waitFor(() => expect(mockedApi.get.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it("abre o sheet ao clicar num post e recarrega quando ele é atualizado", async () => {
    setup();
    mockedApi.get.mockResolvedValue({
      data: [{ id: "9", title: "Clique Aqui", type: "post", is_draft: false, created_at: "2026-01-01T00:00:00Z" }],
    });
    const user = userEvent.setup();
    render(<ConteudoPage />);
    await user.click(await screen.findByText("Clique Aqui"));
    expect(await screen.findByTestId("post-detail-sheet")).toHaveTextContent("post:9");
    const callsBefore = mockedApi.get.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "simular atualização" }));
    await waitFor(() => expect(mockedApi.get.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it("não mostra ações de edição/notificação para quem não pode editar", async () => {
    setup(["volunteer"]);
    mockedApi.get.mockResolvedValue({ data: [] });
    render(<ConteudoPage />);
    await screen.findByText("Nenhum post encontrado.");
    expect(screen.queryByRole("button", { name: /novo post/i })).not.toBeInTheDocument();
  });

  it("mostra e usa a aba Segmentos: contagem, estado vazio e criação", async () => {
    setup();
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/content/posts")) return Promise.resolve({ data: [] });
      if (url.startsWith("/content/segments")) {
        return Promise.resolve({
          data: [
            { id: "s1", name: "Jovens", criteria: { group_ids: ["g1", "g2"], ministry_ids: ["m1"], roles: ["member"], min_age: 12, max_age: 30 }, _count: { posts: 3 } },
            { id: "s2", name: "Sem Critério" },
          ],
        });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    const user = userEvent.setup();
    render(<ConteudoPage />);
    await screen.findByText("Nenhum post encontrado.");

    await user.click(screen.getByRole("tab", { name: "Segmentos" }));
    expect(await screen.findByText("Jovens")).toBeInTheDocument();
    expect(screen.getByText("2 grupo(s) · 1 ministério(s) · member · 12–30 anos")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Todos")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("2 segmentos")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /novo segmento/i }));
    expect(screen.getByTestId("create-segment-modal")).toBeInTheDocument();
    const callsBefore = mockedApi.get.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "simular criação de segmento" }));
    await waitFor(() => expect(mockedApi.get.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it("mostra estado vazio de segmentos com botão de criar o primeiro, e trata falha", async () => {
    setup();
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/content/posts")) return Promise.resolve({ data: [] });
      if (url.startsWith("/content/segments")) return Promise.reject(new Error("boom"));
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    const user = userEvent.setup();
    render(<ConteudoPage />);
    await screen.findByText("Nenhum post encontrado.");
    await user.click(screen.getByRole("tab", { name: "Segmentos" }));
    expect(await screen.findByText("Nenhum segmento cadastrado.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Criar primeiro segmento" }));
    expect(screen.getByTestId("create-segment-modal")).toBeInTheDocument();
  });

  it("aceita resposta paginada de segmentos ({data: []})", async () => {
    setup();
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/content/posts")) return Promise.resolve({ data: [] });
      if (url.startsWith("/content/segments")) return Promise.resolve({ data: { data: [{ id: "s1", name: "Do Envelope" }] } });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    const user = userEvent.setup();
    render(<ConteudoPage />);
    await screen.findByText("Nenhum post encontrado.");
    await user.click(screen.getByRole("tab", { name: "Segmentos" }));
    expect(await screen.findByText("Do Envelope")).toBeInTheDocument();
  });

  it("mostra e usa a aba Notificações: estado vazio, envio e taxa de abertura", async () => {
    setup();
    mockedApi.get.mockResolvedValue({ data: [] });
    const user = userEvent.setup();
    render(<ConteudoPage />);
    await screen.findByText("Nenhum post encontrado.");

    await user.click(screen.getByRole("tab", { name: "Notificações" }));
    expect(
      await screen.findByText("Nenhuma notificação enviada nesta sessão.")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /enviar notificação/i }));
    expect(screen.getByTestId("send-notification-modal")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "simular envio" }));

    expect(await screen.findByText("Notificação manual")).toBeInTheDocument();
    expect(screen.getByText("42 entregue(s)")).toBeInTheDocument();
  });

  it("não mostra ações de notificação para quem não pode editar", async () => {
    setup(["volunteer"]);
    mockedApi.get.mockResolvedValue({ data: [] });
    const user = userEvent.setup();
    render(<ConteudoPage />);
    await screen.findByText("Nenhum post encontrado.");
    await user.click(screen.getByRole("tab", { name: "Notificações" }));
    expect(screen.queryByRole("button", { name: /enviar notificação/i })).not.toBeInTheDocument();
  });

  it("trata usuário sem roles como sem permissão nenhuma (fallback ?? [])", async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: "u1",
        name: "Ana",
        email: "ana@a.com",
        roles: undefined as unknown as string[],
        tenant_id: "t1",
        congregation_id: "c1",
        support_session: false,
        support_tenant_name: null,
      },
      isLoading: false,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    });
    mockedApi.get.mockResolvedValue({ data: [] });
    render(<ConteudoPage />);
    await screen.findByText("Nenhum post encontrado.");
    expect(screen.queryByRole("button", { name: /novo post/i })).not.toBeInTheDocument();
  });

  it("usa os valores default quando as respostas não trazem data/data[]", async () => {
    setup();
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/content/posts")) return Promise.resolve({ data: {} });
      if (url.startsWith("/content/segments")) return Promise.resolve({ data: {} });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    const user = userEvent.setup();
    render(<ConteudoPage />);
    expect(await screen.findByText("Nenhum post encontrado.")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Segmentos" }));
    expect(await screen.findByText("Nenhum segmento cadastrado.")).toBeInTheDocument();
  });

  it("mostra 'Todos' quando o segmento tem critério presente mas vazio", async () => {
    setup();
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/content/posts")) return Promise.resolve({ data: [] });
      if (url.startsWith("/content/segments")) {
        return Promise.resolve({ data: [{ id: "s1", name: "Vazio", criteria: {} }] });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    const user = userEvent.setup();
    render(<ConteudoPage />);
    await screen.findByText("Nenhum post encontrado.");
    await user.click(screen.getByRole("tab", { name: "Segmentos" }));
    await screen.findByText("Vazio");
    expect(screen.getByText("Todos")).toBeInTheDocument();
  });

  it("mostra a faixa etária com só idade mínima e só idade máxima", async () => {
    setup();
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/content/posts")) return Promise.resolve({ data: [] });
      if (url.startsWith("/content/segments")) {
        return Promise.resolve({
          data: [
            { id: "s1", name: "Só Mínima", criteria: { min_age: 18 } },
            { id: "s2", name: "Só Máxima", criteria: { max_age: 65 } },
          ],
        });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    const user = userEvent.setup();
    render(<ConteudoPage />);
    await screen.findByText("Nenhum post encontrado.");
    await user.click(screen.getByRole("tab", { name: "Segmentos" }));
    expect(await screen.findByText("18–∞ anos")).toBeInTheDocument();
    expect(screen.getByText("0–65 anos")).toBeInTheDocument();
  });
});
