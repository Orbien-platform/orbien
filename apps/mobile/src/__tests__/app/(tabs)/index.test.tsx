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

// getPosts alimenta tanto "Avisos recentes" (limit 3, HOME-03) quanto o
// hero (limit 5, MHR-05) — o mock distingue pelo `limit` recebido, para os
// dois poderem ter conteúdo diferente no mesmo teste.
const mockGetPosts = jest.fn();
jest.mock("../../../lib/content/content-client", () => ({
  getPosts: (...args: unknown[]) => mockGetPosts(...args),
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

function mockPosts({
  home = [],
  hero = [],
}: {
  home?: ReturnType<typeof makePost>[];
  hero?: ReturnType<typeof makePost>[];
} = {}) {
  mockGetPosts.mockImplementation((_page?: number, limit?: number) => {
    if (limit === 5) return Promise.resolve({ data: hero, total: hero.length });
    return Promise.resolve({ data: home, total: home.length });
  });
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
    mockPosts({ hero: [makePost({ id: "hero-1", title: "Conteúdo em destaque" })] });

    await renderHome();

    await waitFor(() => screen.getByTestId("hero-slider"));
    expect(screen.getByTestId("hero-slide-hero-1")).toBeTruthy();
  });

  it("toque num item do hero navega para /post/[id] (MHR-05)", async () => {
    mockPosts({ hero: [makePost({ id: "hero-1" })] });

    await renderHome();
    await waitFor(() => screen.getByTestId("hero-slide-hero-1"));

    fireEvent.press(screen.getByTestId("hero-slide-hero-1"));

    expect(mockPush).toHaveBeenCalledWith("/post/hero-1");
  });

  // MHR-06: degradação silenciosa do hero.
  it("hero ausente quando getPosts(1,5) retorna lista vazia, sem travar a Home (MHR-06)", async () => {
    mockPosts({ hero: [] });

    await renderHome();

    await waitFor(() => screen.getByTestId("home-greeting"));
    expect(screen.queryByTestId("hero-slider")).toBeNull();
  });

  it("hero ausente quando getPosts(1,5) falha, sem erro bloqueante (MHR-06)", async () => {
    mockGetPosts.mockImplementation((_page?: number, limit?: number) => {
      if (limit === 5) return Promise.reject(new Error("falha de rede"));
      return Promise.resolve({ data: [], total: 0 });
    });

    await renderHome();

    await waitFor(() => screen.getByTestId("home-greeting"));
    expect(screen.queryByTestId("hero-slider")).toBeNull();
  });

  // MHR-07: CTAs Bíblia / Contribuição / Todos os conteúdos sempre presentes.
  it("mostra o CTA de Bíblia e navega para /biblia ao tocar (MHR-07)", async () => {
    await renderHome();

    expect(screen.getByTestId("quick-action-biblia")).toBeTruthy();
    fireEvent.press(screen.getByTestId("quick-action-biblia"));
    expect(mockPush).toHaveBeenCalledWith("/biblia");
  });

  it("mostra o CTA de 'Ver todos os conteúdos' e navega para a aba /conteudo ao tocar (MHR-07)", async () => {
    await renderHome();

    expect(screen.getByTestId("quick-action-conteudo")).toBeTruthy();
    fireEvent.press(screen.getByTestId("quick-action-conteudo"));
    expect(mockPush).toHaveBeenCalledWith("/conteudo");
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

  // HOME-03 (herdado, MHR-10): destaque "Avisos recentes".
  it("mostra os posts recentes retornados por getPosts(1, 3) (HOME-03/MHR-10)", async () => {
    mockPosts({ home: [makePost({ id: "p1", title: "Aviso 1" })] });

    await renderHome();

    await waitFor(() => screen.getByTestId("home-posts-section"));
    expect(screen.getByTestId("home-post-p1")).toBeTruthy();
    expect(mockGetPosts).toHaveBeenCalledWith(1, 3);
  });

  it("sem post recente, a seção não aparece (HOME-03/MHR-10)", async () => {
    mockPosts({ home: [] });

    await renderHome();

    await waitFor(() => screen.getByTestId("home-greeting"));
    expect(screen.queryByTestId("home-posts-section")).toBeNull();
  });

  it("erro ao carregar posts recentes não derruba a tela (HOME-03/MHR-10)", async () => {
    mockGetPosts.mockImplementation((_page?: number, limit?: number) => {
      if (limit === 5) return Promise.resolve({ data: [], total: 0 });
      return Promise.reject(new Error("falha de rede"));
    });

    await renderHome();

    await waitFor(() => screen.getByTestId("home-greeting"));
    expect(screen.queryByTestId("home-posts-section")).toBeNull();
  });

  it("toque num post recente navega para /post/[id] (HOME-03/MHR-10)", async () => {
    mockPosts({ home: [makePost({ id: "p1", published_at: null })] });

    await renderHome();
    await waitFor(() => screen.getByTestId("home-post-p1"));

    fireEvent.press(screen.getByTestId("home-post-p1"));

    expect(mockPush).toHaveBeenCalledWith("/post/p1");
  });
});
