// Fora de `src/app` de propósito: arquivo `.tsx` na raiz de rotas entra no
// bundle pelo `require.context` do expo-router e arrasta o
// @testing-library/react-native, que não resolve no Metro. Ver README,
// "Portão de bundle no `build`".
//
// Testes derivados dos ACs de MHR-05 a MHR-11 (spec.md, história "P1: Nova
// Home com hero dinâmico e CTAs") e T11 (tasks.md, Done-when). A lista de
// "Próximas escalas" (MOB-04) migrou para `src/app/escala.tsx` — suíte
// própria em `src/__tests__/app/escala.test.tsx` (T5). Este arquivo cobre
// a Home reescrita: hero dinâmico (MHR-05/06), os 3 CTAs sempre presentes
// (MHR-07), o atalho de Escala gated (MHR-08), o cartão de Celebrações
// (MHR-09), a saudação/"Meus grupos"/"Avisos recentes" preservados
// (MHR-10, herdados de HOME-01/02/03) e o CTA de Contribuição desabilitado
// sem tenant_slug (MHR-11).
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { webUrl: "https://web.exemplo.test" },
    },
  },
}));

const mockOpenBrowserAsync = jest.fn();
jest.mock("expo-web-browser", () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowserAsync(...args),
}));

const mockUseAuth = jest.fn();
jest.mock("../../../lib/auth/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseTheme = jest.fn();
jest.mock("../../../lib/theme/theme-provider", () => ({
  useTheme: () => mockUseTheme(),
}));

// Destaques da home (HOME-02/03) — mockados com resolução vazia por padrão
// (`beforeEach` abaixo), para os testes que não os mencionam não
// dependerem de setup próprio.
const mockListMyGroups = jest.fn();
jest.mock("../../../lib/pequenos-grupos/pequenos-grupos-client", () => ({
  listMyGroups: (...args: unknown[]) => mockListMyGroups(...args),
}));

// getPosts(1, 5) alimenta tanto o hero (MHR-05, todos os itens) quanto
// "Avisos recentes" (HOME-03, os 3 primeiros do mesmo resultado) — uma
// chamada só, ver nota em (tabs)/index.tsx.
const mockGetPosts = jest.fn();
// Destaques escolhidos no web: quando vêm, o hero é deles; vazio (ou falha),
// o hero cai no getPosts(1, 5).
const mockGetHighlights = jest.fn();
jest.mock("../../../lib/content/content-client", () => ({
  getPosts: (...args: unknown[]) => mockGetPosts(...args),
  getHighlights: (...args: unknown[]) => mockGetHighlights(...args),
}));

import { palettes } from "../../../lib/theme/tokens";
import HomeScreen from "../../../app/(tabs)/index";

function makePost(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    type: "announcement",
    title: "Aviso 1",
    body: null,
    media_url: null,
    published_at: "2026-09-10T10:00:00.000Z",
    created_at: "2026-09-10T10:00:00.000Z",
    ...overrides,
  };
}

function mockPosts(posts: ReturnType<typeof makePost>[] = []) {
  mockGetPosts.mockResolvedValue({ data: posts, total: posts.length });
}

function themeValue(overrides: Record<string, unknown> = {}) {
  return {
    primaryColor: "#1E3A7B",
    accentColor: "#00B8A2",
    accentReadable: "#1E3A7B",
    logoUrl: null,
    appName: "Igreja Teste",
    tenantSlug: "igreja-teste",
    scheme: "light" as const,
    isDark: false,
    preference: "system" as const,
    setPreference: jest.fn(),
    colors: palettes.light,
    shadow: { sm: {}, md: {}, lg: {} },
    ...overrides,
  };
}

async function renderHome() {
  await act(async () => {
    render(<HomeScreen />);
  });
}

describe("HomeScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListMyGroups.mockResolvedValue([]);
    mockPosts();
    mockGetHighlights.mockResolvedValue([]);
    mockUseAuth.mockReturnValue({ areas: null });
    mockUseTheme.mockReturnValue(themeValue());
    mockOpenBrowserAsync.mockResolvedValue({ type: "dismiss" });
  });

  // HOME-01 (herdado, MHR-10): saudação sempre aparece.
  it("mostra a saudação da home (HOME-01/MHR-10)", async () => {
    await renderHome();

    expect(screen.getByTestId("home-greeting")).toBeTruthy();
  });

  // MHR-05: hero dinâmico com os últimos conteúdos.
  it("hero presente: mostra um slide por post retornado por getPosts(1, 5) (MHR-05)", async () => {
    mockPosts([makePost({ id: "hero-1", title: "Conteúdo em destaque" })]);

    await renderHome();

    await waitFor(() => screen.getByTestId("hero-slider"));
    expect(screen.getByTestId("hero-slide-hero-1")).toBeTruthy();
  });

  it("toque num item do hero navega para /post/[id] (MHR-05)", async () => {
    mockPosts([makePost({ id: "hero-1" })]);

    await renderHome();
    await waitFor(() => screen.getByTestId("hero-slide-hero-1"));

    fireEvent.press(screen.getByTestId("hero-slide-hero-1"));

    expect(mockPush).toHaveBeenCalledWith("/post/hero-1");
  });

  it("com destaques escolhidos no web, o hero mostra só eles, na ordem da API", async () => {
    mockPosts([makePost({ id: "recente" })]);
    mockGetHighlights.mockResolvedValue([
      makePost({ id: "dest-2", title: "Retiro" }),
      makePost({ id: "dest-1", title: "Culto" }),
    ]);

    await renderHome();

    await waitFor(() => screen.getByTestId("hero-slide-dest-2"));
    expect(screen.getByTestId("hero-slide-dest-1")).toBeTruthy();
    expect(screen.queryByTestId("hero-slide-recente")).toBeNull();
  });

  it("destaques falhando não somem com o hero: cai nos últimos publicados", async () => {
    mockPosts([makePost({ id: "recente" })]);
    mockGetHighlights.mockRejectedValue(new Error("offline"));

    await renderHome();

    await waitFor(() => screen.getByTestId("hero-slide-recente"));
  });

  // MHR-06: degradação silenciosa do hero.
  it("hero ausente quando getPosts(1,5) retorna lista vazia, sem travar a Home (MHR-06)", async () => {
    mockPosts([]);

    await renderHome();

    await waitFor(() => screen.getByTestId("home-greeting"));
    expect(screen.queryByTestId("hero-slider")).toBeNull();
  });

  it("hero ausente quando getPosts(1,5) falha, sem erro bloqueante (MHR-06)", async () => {
    mockGetPosts.mockRejectedValue(new Error("falha de rede"));

    await renderHome();

    await waitFor(() => screen.getByTestId("home-greeting"));
    expect(screen.queryByTestId("hero-slider")).toBeNull();
  });

  // MHR-07: CTAs Bíblia / Contribua sempre presentes.
  it("mostra o CTA de Bíblia e navega para /biblia ao tocar (MHR-07)", async () => {
    await renderHome();

    expect(screen.getByTestId("quick-action-biblia")).toBeTruthy();
    fireEvent.press(screen.getByTestId("quick-action-biblia"));
    expect(mockPush).toHaveBeenCalledWith("/biblia");
  });

  it("não tem CTA de 'Ver todos os conteúdos' — a tab bar já leva à aba Conteúdo", async () => {
    await renderHome();

    expect(screen.queryByTestId("quick-action-conteudo")).toBeNull();
  });

  it("CTA de contribuição se chama 'Contribua'", async () => {
    await renderHome();

    expect(screen.getByText("Contribua")).toBeTruthy();
  });

  it("CTA de Contribuição habilitado abre WEB_URL/doar/{tenant_slug} em browser in-app (MHR-07)", async () => {
    mockUseTheme.mockReturnValue(themeValue({ tenantSlug: "igreja-teste" }));

    await renderHome();
    fireEvent.press(screen.getByTestId("quick-action-contribuicao"));

    expect(mockOpenBrowserAsync).toHaveBeenCalledWith(
      "https://web.exemplo.test/doar/igreja-teste",
    );
  });

  // MHR-11: CTA de Contribuição desabilitado sem tenant_slug.
  it("CTA de Contribuição fica disabled quando tenantSlug é null e o toque não abre nada (MHR-11)", async () => {
    mockUseTheme.mockReturnValue(themeValue({ tenantSlug: null }));

    await renderHome();
    fireEvent.press(screen.getByTestId("quick-action-contribuicao"));

    expect(mockOpenBrowserAsync).not.toHaveBeenCalled();
  });

  // MHR-08: atalho de Escala com gate de permissão.
  it("mostra o atalho de Escala quando areas inclui volunteers, navegando para /escala (MHR-08)", async () => {
    mockUseAuth.mockReturnValue({ areas: ["volunteers"] });

    await renderHome();

    expect(screen.getByTestId("quick-action-escala")).toBeTruthy();
    fireEvent.press(screen.getByTestId("quick-action-escala"));
    expect(mockPush).toHaveBeenCalledWith("/escala");
  });

  it("mostra o atalho de Escala quando areas ainda é null (fail-open, mesma regra da tab bar) (MHR-08)", async () => {
    mockUseAuth.mockReturnValue({ areas: null });

    await renderHome();

    expect(screen.getByTestId("quick-action-escala")).toBeTruthy();
  });

  it("não mostra o atalho de Escala quando areas não inclui volunteers (MHR-08)", async () => {
    mockUseAuth.mockReturnValue({ areas: ["other_area"] });

    await renderHome();

    expect(screen.queryByTestId("quick-action-escala")).toBeNull();
  });

  // MHR-09: cartão de Celebrações e eventos, sem gate de papel.
  it("mostra o cartão de Celebrações sempre, mesmo sem a área volunteers, navegando para /celebracoes (MHR-09)", async () => {
    mockUseAuth.mockReturnValue({ areas: ["other_area"] });

    await renderHome();

    expect(screen.getByTestId("quick-action-celebracoes")).toBeTruthy();
    fireEvent.press(screen.getByTestId("quick-action-celebracoes"));
    expect(mockPush).toHaveBeenCalledWith("/celebracoes");
  });

  // HOME-02 (herdado, MHR-10): destaque "Meus grupos".
  it("mostra até 2 grupos, mesmo com mais retornados pela API (HOME-02/MHR-10)", async () => {
    mockListMyGroups.mockResolvedValue([
      { id: "g1", name: "Célula Central", meeting_time: "Quintas, 19h30", recurrence: "weekly", role: "member" },
      { id: "g2", name: "Célula Norte", meeting_time: null, recurrence: null, role: "leader" },
      { id: "g3", name: "Célula Sul", meeting_time: null, recurrence: null, role: "member" },
    ]);

    await renderHome();

    await waitFor(() => screen.getByTestId("home-groups-section"));
    expect(screen.getByTestId("home-group-g1")).toBeTruthy();
    expect(screen.getByTestId("home-group-g2")).toBeTruthy();
    expect(screen.queryByTestId("home-group-g3")).toBeNull();
  });

  it("sem grupo, a seção não aparece (HOME-02/MHR-10)", async () => {
    mockListMyGroups.mockResolvedValue([]);

    await renderHome();

    await waitFor(() => screen.getByTestId("home-greeting"));
    expect(screen.queryByTestId("home-groups-section")).toBeNull();
  });

  it("erro ao carregar grupos não derruba a tela (HOME-02/MHR-10)", async () => {
    mockListMyGroups.mockRejectedValue(new Error("falha de rede"));

    await renderHome();

    await waitFor(() => screen.getByTestId("home-greeting"));
    expect(screen.queryByTestId("home-groups-section")).toBeNull();
  });

  it("toque num grupo navega para /grupo/[id] (HOME-02/MHR-10)", async () => {
    mockListMyGroups.mockResolvedValue([
      { id: "g1", name: "Célula Central", meeting_time: null, recurrence: null, role: "member" },
    ]);

    await renderHome();
    await waitFor(() => screen.getByTestId("home-group-g1"));

    fireEvent.press(screen.getByTestId("home-group-g1"));

    expect(mockPush).toHaveBeenCalledWith("/grupo/g1");
  });

  // HOME-03 (herdado, MHR-10): destaque "Avisos recentes", recortado do
  // mesmo getPosts(1, 5) que alimenta o hero (MHR-05/06).
  it("mostra os posts recentes recortados de getPosts(1, 5) (HOME-03/MHR-10)", async () => {
    mockPosts([makePost({ id: "p1", title: "Aviso 1" })]);

    await renderHome();

    await waitFor(() => screen.getByTestId("home-posts-section"));
    expect(screen.getByTestId("home-post-p1")).toBeTruthy();
    expect(mockGetPosts).toHaveBeenCalledWith(1, 5);
  });

  it("sem post recente, a seção não aparece (HOME-03/MHR-10)", async () => {
    mockPosts([]);

    await renderHome();

    await waitFor(() => screen.getByTestId("home-greeting"));
    expect(screen.queryByTestId("home-posts-section")).toBeNull();
  });

  it("erro ao carregar posts recentes não derruba a tela (HOME-03/MHR-10)", async () => {
    mockGetPosts.mockRejectedValue(new Error("falha de rede"));

    await renderHome();

    await waitFor(() => screen.getByTestId("home-greeting"));
    expect(screen.queryByTestId("home-posts-section")).toBeNull();
  });

  it("toque num post recente navega para /post/[id] (HOME-03/MHR-10)", async () => {
    mockPosts([makePost({ id: "p1", published_at: null })]);

    await renderHome();
    await waitFor(() => screen.getByTestId("home-post-p1"));

    fireEvent.press(screen.getByTestId("home-post-p1"));

    expect(mockPush).toHaveBeenCalledWith("/post/p1");
  });
  it("respostas que chegam depois de a Home desmontar são ignoradas (sucesso e falha)", async () => {
    let resolveGroups!: (value: unknown) => void;
    let resolvePosts!: (value: unknown) => void;
    let resolveHighlights!: (value: unknown) => void;
    mockListMyGroups.mockReturnValue(new Promise((r) => (resolveGroups = r)));
    mockGetPosts.mockReturnValue(new Promise((r) => (resolvePosts = r)));
    mockGetHighlights.mockReturnValue(new Promise((r) => (resolveHighlights = r)));

    const view = await render(<HomeScreen />);
    await act(async () => {
      view.unmount();
    });
    await act(async () => {
      resolveGroups([]);
      resolvePosts({ data: [makePost()], total: 1 });
      resolveHighlights([makePost()]);
    });

    let rejectHighlights!: (reason: unknown) => void;
    mockGetHighlights.mockReturnValue(new Promise((_, r) => (rejectHighlights = r)));
    const second = await render(<HomeScreen />);
    await act(async () => {
      second.unmount();
    });
    await act(async () => {
      rejectHighlights(new Error("offline"));
    });

    expect(mockGetHighlights).toHaveBeenCalledTimes(2);
  });

  it("CTA de Contribuição sem WEB_URL configurada não abre nada", async () => {
    const extra = jest.requireMock<{ default: { expoConfig: { extra: { webUrl?: string } } } }>(
      "expo-constants",
    ).default.expoConfig.extra;
    const original = extra.webUrl;
    extra.webUrl = undefined;
    try {
      await renderHome();
      fireEvent.press(screen.getByTestId("quick-action-contribuicao"));
      expect(mockOpenBrowserAsync).not.toHaveBeenCalled();
    } finally {
      extra.webUrl = original;
    }
  });

  it("CTA de Contribuição sem navegador disponível não derruba a tela", async () => {
    mockOpenBrowserAsync.mockRejectedValue(new Error("sem navegador"));

    await renderHome();
    await act(async () => {
      fireEvent.press(screen.getByTestId("quick-action-contribuicao"));
    });

    expect(mockOpenBrowserAsync).toHaveBeenCalled();
    expect(screen.getByTestId("home-greeting")).toBeTruthy();
  });
});
