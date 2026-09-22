// Fora de `src/app` de propósito: arquivo `.tsx` na raiz de rotas entra no
// bundle pelo `require.context` do expo-router e arrasta o
// @testing-library/react-native, que não resolve no Metro. Ver README,
// "Portão de bundle no `build`".
//
// A lista de "Próximas escalas" (MOB-04, AC 1/2/3) migrou para
// `src/app/escala.tsx` — suíte própria em
// `src/__tests__/app/escala.test.tsx` (T5,
// .specs/features/mobile-home-redesign/tasks.md). Este arquivo cobre só o
// que sobrou aqui: a saudação (HOME-01) e os destaques "Meus grupos"
// (HOME-02) e "Avisos recentes" (HOME-03) — estado intermediário até T11
// recompor esta tela como a Home definitiva (hero, CTAs).
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Destaques da home (HOME-02/03) — mockados com resolução vazia por padrão
// (`beforeEach` abaixo), para os testes que não os mencionam não
// dependerem de setup próprio.
const mockListMyGroups = jest.fn();
jest.mock("../../../lib/pequenos-grupos/pequenos-grupos-client", () => ({
  listMyGroups: (...args: unknown[]) => mockListMyGroups(...args),
}));

const mockGetPosts = jest.fn();
jest.mock("../../../lib/content/content-client", () => ({
  getPosts: (...args: unknown[]) => mockGetPosts(...args),
}));

import HomeScreen from "../../../app/(tabs)/index";

describe("HomeScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListMyGroups.mockResolvedValue([]);
    mockGetPosts.mockResolvedValue({ data: [], total: 0 });
  });

  // HOME-01: saudação sempre aparece — a data real decide o texto
  // (getGreeting tem cobertura própria em date.test.ts), aqui só confirma
  // que a tela a desenha.
  it("mostra a saudação da home (HOME-01)", async () => {
    await act(async () => {
      render(<HomeScreen />);
    });

    expect(screen.getByTestId("home-greeting")).toBeTruthy();
  });

  // HOME-02: destaque "Meus grupos".
  it("mostra até 2 grupos, mesmo com mais retornados pela API (HOME-02)", async () => {
    mockListMyGroups.mockResolvedValue([
      { id: "g1", name: "Célula Central", meeting_time: "Quintas, 19h30", recurrence: "weekly", role: "member" },
      { id: "g2", name: "Célula Norte", meeting_time: null, recurrence: null, role: "leader" },
      { id: "g3", name: "Célula Sul", meeting_time: null, recurrence: null, role: "member" },
    ]);

    await act(async () => {
      render(<HomeScreen />);
    });

    await waitFor(() => screen.getByTestId("home-groups-section"));
    expect(screen.getByTestId("home-group-g1")).toBeTruthy();
    expect(screen.getByTestId("home-group-g2")).toBeTruthy();
    expect(screen.queryByTestId("home-group-g3")).toBeNull();
  });

  it("sem grupo, a seção não aparece (HOME-02)", async () => {
    mockListMyGroups.mockResolvedValue([]);

    await act(async () => {
      render(<HomeScreen />);
    });

    await waitFor(() => screen.getByTestId("home-greeting"));
    expect(screen.queryByTestId("home-groups-section")).toBeNull();
  });

  it("erro ao carregar grupos não derruba a tela (HOME-02)", async () => {
    mockListMyGroups.mockRejectedValue(new Error("falha de rede"));

    await act(async () => {
      render(<HomeScreen />);
    });

    await waitFor(() => screen.getByTestId("home-greeting"));
    expect(screen.queryByTestId("home-groups-section")).toBeNull();
  });

  it("toque num grupo navega para /grupo/[id] (HOME-02)", async () => {
    mockListMyGroups.mockResolvedValue([
      { id: "g1", name: "Célula Central", meeting_time: null, recurrence: null, role: "member" },
    ]);

    await act(async () => {
      render(<HomeScreen />);
    });
    await waitFor(() => screen.getByTestId("home-group-g1"));

    fireEvent.press(screen.getByTestId("home-group-g1"));

    expect(mockPush).toHaveBeenCalledWith("/grupo/g1");
  });

  // HOME-03: destaque "Avisos recentes".
  it("mostra os posts recentes retornados por getPosts (HOME-03)", async () => {
    mockGetPosts.mockResolvedValue({
      data: [
        { id: "p1", type: "announcement", title: "Aviso 1", body: null, media_url: null, published_at: "2026-09-10T10:00:00.000Z", created_at: "2026-09-10T10:00:00.000Z" },
      ],
      total: 1,
    });

    await act(async () => {
      render(<HomeScreen />);
    });

    await waitFor(() => screen.getByTestId("home-posts-section"));
    expect(screen.getByTestId("home-post-p1")).toBeTruthy();
    expect(mockGetPosts).toHaveBeenCalledWith(1, 3);
  });

  it("sem post recente, a seção não aparece (HOME-03)", async () => {
    mockGetPosts.mockResolvedValue({ data: [], total: 0 });

    await act(async () => {
      render(<HomeScreen />);
    });

    await waitFor(() => screen.getByTestId("home-greeting"));
    expect(screen.queryByTestId("home-posts-section")).toBeNull();
  });

  it("erro ao carregar posts não derruba a tela (HOME-03)", async () => {
    mockGetPosts.mockRejectedValue(new Error("falha de rede"));

    await act(async () => {
      render(<HomeScreen />);
    });

    await waitFor(() => screen.getByTestId("home-greeting"));
    expect(screen.queryByTestId("home-posts-section")).toBeNull();
  });

  it("toque num post navega para /post/[id] (HOME-03)", async () => {
    mockGetPosts.mockResolvedValue({
      data: [
        { id: "p1", type: "announcement", title: "Aviso 1", body: null, media_url: null, published_at: null, created_at: "2026-09-10T10:00:00.000Z" },
      ],
      total: 1,
    });

    await act(async () => {
      render(<HomeScreen />);
    });
    await waitFor(() => screen.getByTestId("home-post-p1"));

    fireEvent.press(screen.getByTestId("home-post-p1"));

    expect(mockPush).toHaveBeenCalledWith("/post/p1");
  });
});
