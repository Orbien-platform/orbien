import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useParams } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EncontreUmaCelulaPage, { distanceKm, formatDistance, recurrenceLabel } from "./page";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useParams: vi.fn(),
}));

// O mapa é carregado por `next/dynamic` com `ssr: false` e puxa o Leaflet, que
// precisa de um DOM com layout de verdade. O que a página deve à tela é passar
// os pontos certos — é isso que o dublê expõe.
vi.mock("@/components/groups/PublicCellsMap", () => ({
  PublicCellsMap: ({ points }: { points: Array<{ id: string }> }) => (
    <div data-testid="mapa" data-points={points.map((p) => p.id).join(",")} />
  ),
}));

const CELL_CENTRO = {
  id: "sg1",
  name: "Célula Centro",
  description: "Toda quinta com café",
  photo_url: null,
  address: "Rua da Sé, 100",
  lat: -23.5505199,
  lng: -46.6333094,
  meeting_time: "19:30",
  recurrence: "weekly",
  group_type: { id: "gt1", name: "Célula de casais", color: null },
  congregation: { id: "c1", name: "Sede" },
};

const CELL_JARDIM = {
  id: "sg2",
  name: "Célula Jardim",
  description: null,
  photo_url: null,
  address: "Rua das Flores, 20",
  lat: -23.6,
  lng: -46.7,
  meeting_time: null,
  recurrence: null,
  group_type: { id: "gt2", name: "Célula de jovens", color: null },
  congregation: { id: "c2", name: "Bairro" },
};

// Coordenada pela metade: o banco tem `lat` e `lng` separados e nada obriga a
// preencher os dois. A célula não entra no mapa nem é medida por distância.
const CELL_MEIA_COORDENADA = {
  ...CELL_JARDIM,
  id: "sg4",
  name: "Célula Meia Coordenada",
  lat: -23.7,
  lng: null,
};

const CELL_SEM_MAPA = {
  ...CELL_JARDIM,
  id: "sg3",
  name: "Célula Sem Coordenada",
  address: null,
  lat: null,
  lng: null,
  congregation: { id: "c1", name: "Sede" },
};

function mockList(groups: unknown[], churchName = "Igreja Central") {
  vi.mocked(api.get).mockResolvedValue({ data: { church_name: churchName, groups } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useParams).mockReturnValue({ tenant_slug: "central" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("helpers", () => {
  it("traduz as recorrências conhecidas e repassa a desconhecida", () => {
    expect(recurrenceLabel("weekly")).toBe("Toda semana");
    expect(recurrenceLabel("biweekly")).toBe("A cada 15 dias");
    expect(recurrenceLabel("monthly")).toBe("Uma vez por mês");
    expect(recurrenceLabel("quinzenal-custom")).toBe("quinzenal-custom");
    expect(recurrenceLabel(null)).toBeNull();
  });

  it("mede distância em linha reta entre dois pontos", () => {
    // Sé → Congonhas, ~8 km em linha reta.
    const km = distanceKm({ lat: -23.5505, lng: -46.6333 }, { lat: -23.6262, lng: -46.6556 });
    expect(km).toBeGreaterThan(7);
    expect(km).toBeLessThan(10);
  });

  it("mostra metros abaixo de 1 km e quilômetros acima", () => {
    expect(formatDistance(0.42)).toBe("420 m");
    expect(formatDistance(3.25)).toBe("3,3 km");
  });
});

describe("EncontreUmaCelulaPage", () => {
  it("busca as células da igreja da rota e lista o que veio", async () => {
    mockList([CELL_CENTRO, CELL_JARDIM]);

    render(<EncontreUmaCelulaPage />);

    expect(await screen.findByText("Célula Centro")).toBeInTheDocument();
    expect(screen.getByText("Célula Jardim")).toBeInTheDocument();
    expect(screen.getByText(/Células abertas da Igreja Central/)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/public/small-groups", {
      params: { tenant_slug: "central" },
    });
  });

  it("mostra horário, recorrência, endereço e congregação no card", async () => {
    mockList([CELL_CENTRO]);

    render(<EncontreUmaCelulaPage />);

    expect(await screen.findByText("Toda semana · 19:30")).toBeInTheDocument();
    expect(screen.getByText("Rua da Sé, 100")).toBeInTheDocument();
    expect(screen.getByText("Sede")).toBeInTheDocument();
    expect(screen.getByText("Célula de casais")).toBeInTheDocument();
  });

  it("manda para o mapa só as células com coordenada", async () => {
    mockList([CELL_CENTRO, CELL_SEM_MAPA]);

    render(<EncontreUmaCelulaPage />);

    const mapa = await screen.findByTestId("mapa");
    expect(mapa).toHaveAttribute("data-points", "sg1");
  });

  it("não desenha mapa nenhum quando nenhuma célula tem coordenada", async () => {
    mockList([CELL_SEM_MAPA]);

    render(<EncontreUmaCelulaPage />);

    expect(await screen.findByText("Célula Sem Coordenada")).toBeInTheDocument();
    expect(screen.queryByTestId("mapa")).not.toBeInTheDocument();
  });

  it("filtra por texto de busca, olhando nome, endereço e descrição", async () => {
    mockList([CELL_CENTRO, CELL_JARDIM]);
    const user = userEvent.setup();

    render(<EncontreUmaCelulaPage />);
    await screen.findByText("Célula Centro");

    await user.type(screen.getByPlaceholderText(/bairro, endereço/i), "flores");

    await waitFor(() => {
      expect(screen.queryByText("Célula Centro")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Célula Jardim")).toBeInTheDocument();
  });

  it("filtra por tipo de célula", async () => {
    mockList([CELL_CENTRO, CELL_JARDIM]);
    const user = userEvent.setup();

    render(<EncontreUmaCelulaPage />);
    await screen.findByText("Célula Centro");

    await user.selectOptions(screen.getByLabelText("Tipo de célula"), "gt2");

    expect(screen.queryByText("Célula Centro")).not.toBeInTheDocument();
    expect(screen.getByText("Célula Jardim")).toBeInTheDocument();
  });

  it("filtra por congregação", async () => {
    mockList([CELL_CENTRO, CELL_JARDIM]);
    const user = userEvent.setup();

    render(<EncontreUmaCelulaPage />);
    await screen.findByText("Célula Centro");

    await user.selectOptions(screen.getByLabelText("Congregação"), "c2");

    expect(screen.queryByText("Célula Centro")).not.toBeInTheDocument();
    expect(screen.getByText("Célula Jardim")).toBeInTheDocument();
  });

  it("esconde os seletores quando há um tipo só e uma congregação só", async () => {
    mockList([CELL_CENTRO]);

    render(<EncontreUmaCelulaPage />);
    await screen.findByText("Célula Centro");

    expect(screen.queryByLabelText("Tipo de célula")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Congregação")).not.toBeInTheDocument();
  });

  it("avisa quando o filtro não deixa nada", async () => {
    mockList([CELL_CENTRO]);
    const user = userEvent.setup();

    render(<EncontreUmaCelulaPage />);
    await screen.findByText("Célula Centro");

    await user.type(screen.getByPlaceholderText(/bairro, endereço/i), "não existe nada assim");

    expect(await screen.findByText(/nenhuma célula encontrada/i)).toBeInTheDocument();
  });

  it("ordena por proximidade e mostra a distância quando o navegador dá a posição", async () => {
    mockList([CELL_JARDIM, CELL_CENTRO]);
    vi.stubGlobal("navigator", {
      ...navigator,
      geolocation: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({ coords: { latitude: -23.5505, longitude: -46.6333 } } as GeolocationPosition),
      },
    });
    const user = userEvent.setup();

    render(<EncontreUmaCelulaPage />);
    await screen.findByText("Célula Centro");

    await user.click(screen.getByRole("button", { name: /perto de mim/i }));

    const cards = screen.getAllByRole("listitem");
    expect(within(cards[0]).getByText("Célula Centro")).toBeInTheDocument();
    expect(within(cards[0]).getByText(/Rua da Sé, 100 · \d+ m/)).toBeInTheDocument();
  });

  it("joga para o fim as células sem coordenada quando ordena por proximidade", async () => {
    mockList([CELL_SEM_MAPA, CELL_CENTRO]);
    vi.stubGlobal("navigator", {
      ...navigator,
      geolocation: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({ coords: { latitude: -23.5505, longitude: -46.6333 } } as GeolocationPosition),
      },
    });
    const user = userEvent.setup();

    render(<EncontreUmaCelulaPage />);
    await screen.findByText("Célula Centro");

    await user.click(screen.getByRole("button", { name: /perto de mim/i }));

    const cards = screen.getAllByRole("listitem");
    expect(within(cards[0]).getByText("Célula Centro")).toBeInTheDocument();
    expect(within(cards[1]).getByText("Célula Sem Coordenada")).toBeInTheDocument();
  });

  it("trata coordenada pela metade como célula sem mapa", async () => {
    mockList([CELL_MEIA_COORDENADA, CELL_CENTRO]);
    vi.stubGlobal("navigator", {
      ...navigator,
      geolocation: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({ coords: { latitude: -23.5505, longitude: -46.6333 } } as GeolocationPosition),
      },
    });
    const user = userEvent.setup();

    render(<EncontreUmaCelulaPage />);
    await screen.findByText("Célula Centro");

    expect(screen.getByTestId("mapa")).toHaveAttribute("data-points", "sg1");

    await user.click(screen.getByRole("button", { name: /perto de mim/i }));

    const cards = screen.getAllByRole("listitem");
    expect(within(cards[0]).getByText("Célula Centro")).toBeInTheDocument();
    expect(within(cards[1]).getByText("Célula Meia Coordenada")).toBeInTheDocument();
  });

  it("mostra o botão ocupado enquanto o navegador não responde a localização", async () => {
    mockList([CELL_CENTRO]);
    vi.stubGlobal("navigator", {
      ...navigator,
      geolocation: { getCurrentPosition: () => {} },
    });
    const user = userEvent.setup();

    render(<EncontreUmaCelulaPage />);
    await screen.findByText("Célula Centro");

    await user.click(screen.getByRole("button", { name: /perto de mim/i }));

    expect(screen.getByRole("button", { name: /perto de mim/i })).toBeDisabled();
  });

  it("não mexe em estado nenhum se a tela sair antes da resposta chegar", async () => {
    let resolve!: (value: unknown) => void;
    vi.mocked(api.get).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }) as never,
    );

    const { unmount } = render(<EncontreUmaCelulaPage />);
    unmount();
    resolve({ data: { church_name: "Igreja Central", groups: [CELL_CENTRO] } });

    await waitFor(() => {
      expect(screen.queryByText("Célula Centro")).not.toBeInTheDocument();
    });
  });

  it("não mostra erro se a tela sair antes da falha chegar", async () => {
    let reject!: (reason: unknown) => void;
    vi.mocked(api.get).mockReturnValue(
      new Promise((_r, rj) => {
        reject = rj;
      }) as never,
    );

    const { unmount } = render(<EncontreUmaCelulaPage />);
    unmount();
    reject(new Error("rede caiu"));

    await waitFor(() => {
      expect(screen.queryByText(/não foi possível carregar as células/i)).not.toBeInTheDocument();
    });
  });

  it("explica quando a localização é negada", async () => {
    mockList([CELL_CENTRO]);
    vi.stubGlobal("navigator", {
      ...navigator,
      geolocation: {
        getCurrentPosition: (_ok: PositionCallback, fail: PositionErrorCallback) =>
          fail({} as GeolocationPositionError),
      },
    });
    const user = userEvent.setup();

    render(<EncontreUmaCelulaPage />);
    await screen.findByText("Célula Centro");

    await user.click(screen.getByRole("button", { name: /perto de mim/i }));

    expect(await screen.findByText(/não conseguimos sua localização/i)).toBeInTheDocument();
  });

  it("explica quando o navegador não tem geolocalização", async () => {
    mockList([CELL_CENTRO]);
    vi.stubGlobal("navigator", { ...navigator, geolocation: undefined });
    const user = userEvent.setup();

    render(<EncontreUmaCelulaPage />);
    await screen.findByText("Célula Centro");

    await user.click(screen.getByRole("button", { name: /perto de mim/i }));

    expect(await screen.findByText(/não informa localização/i)).toBeInTheDocument();
  });

  it("mostra mensagem própria para igreja inexistente (404)", async () => {
    vi.mocked(api.get).mockRejectedValue({
      isAxiosError: true,
      response: { status: 404, data: {} },
    });

    render(<EncontreUmaCelulaPage />);

    expect(await screen.findByText(/igreja não encontrada/i)).toBeInTheDocument();
  });

  it("mostra erro genérico quando a busca falha por outro motivo", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("rede caiu"));

    render(<EncontreUmaCelulaPage />);

    expect(await screen.findByText(/não foi possível carregar as células/i)).toBeInTheDocument();
  });

  it("marca a célula sob o cursor — é o que o mapa destaca", async () => {
    mockList([CELL_CENTRO, CELL_JARDIM]);
    const user = userEvent.setup();

    render(<EncontreUmaCelulaPage />);
    await screen.findByText("Célula Centro");

    const card = screen.getAllByRole("listitem")[1];
    await user.hover(card);

    expect(card.className).toContain("border-navy");
  });

  it("aponta o 'Como chegar' para o mapa externo, só quando há coordenada", async () => {
    mockList([CELL_CENTRO, CELL_SEM_MAPA]);

    render(<EncontreUmaCelulaPage />);
    await screen.findByText("Célula Centro");

    const links = screen.getAllByRole("link", { name: /como chegar/i });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute(
      "href",
      expect.stringContaining("mlat=-23.5505199&mlon=-46.6333094"),
    );
  });
});

describe("pedido de visita", () => {
  async function abrirFormulario() {
    mockList([CELL_CENTRO]);
    const user = userEvent.setup();
    render(<EncontreUmaCelulaPage />);
    await screen.findByText("Célula Centro");
    await user.click(screen.getByRole("button", { name: /quero visitar/i }));
    return user;
  }

  it("envia nome e telefone para a rota pública da célula", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { status: "received", message: "ok" } });
    const user = await abrirFormulario();

    await user.type(screen.getByLabelText("Seu nome"), "Maria Silva");
    await user.type(screen.getByLabelText("Telefone"), "11999990000");
    await user.type(screen.getByLabelText(/mensagem/i), "posso levar meu filho?");
    await user.click(screen.getByRole("button", { name: /enviar pedido/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/public/small-groups/sg1/visit-request", {
        tenant_slug: "central",
        visitor_name: "Maria Silva",
        visitor_phone: "11999990000",
        visitor_email: undefined,
        message: "posso levar meu filho?",
        website: undefined,
      });
    });
    expect(await screen.findByText(/alguém da célula vai falar com você/i)).toBeInTheDocument();
  });

  it("aceita e-mail no lugar do telefone", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { status: "received", message: "ok" } });
    const user = await abrirFormulario();

    await user.type(screen.getByLabelText("Seu nome"), "Maria");
    await user.type(screen.getByLabelText("E-mail"), "maria@exemplo.com");
    await user.click(screen.getByRole("button", { name: /enviar pedido/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/public/small-groups/sg1/visit-request",
        expect.objectContaining({ visitor_email: "maria@exemplo.com", visitor_phone: undefined }),
      );
    });
  });

  it("mantém o envio desabilitado sem nome ou sem contato", async () => {
    const user = await abrirFormulario();

    expect(screen.getByRole("button", { name: /enviar pedido/i })).toBeDisabled();

    await user.type(screen.getByLabelText("Seu nome"), "Maria");
    expect(screen.getByRole("button", { name: /enviar pedido/i })).toBeDisabled();

    await user.type(screen.getByLabelText("Telefone"), "11999990000");
    expect(screen.getByRole("button", { name: /enviar pedido/i })).toBeEnabled();
  });

  it("não envia quando o formulário é submetido sem contato", async () => {
    const user = await abrirFormulario();

    await user.type(screen.getByLabelText("Seu nome"), "Maria");
    const form = screen.getByRole("button", { name: /enviar pedido/i }).closest("form")!;
    if (form.requestSubmit) form.requestSubmit();
    else form.dispatchEvent(new Event("submit", { cancelable: true }));

    expect(api.post).not.toHaveBeenCalled();
  });

  it("fecha a janela pelo X do cabeçalho, sem enviar nada", async () => {
    const user = await abrirFormulario();

    const [x] = screen.getAllByRole("button", { name: /^fechar$/i });
    await user.click(x);

    await waitFor(() => {
      expect(screen.queryByLabelText("Seu nome")).not.toBeInTheDocument();
    });
    expect(api.post).not.toHaveBeenCalled();
  });

  it("manda o honeypot preenchido quando algum robô o preenche", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { status: "received", message: "ok" } });
    const user = await abrirFormulario();

    await user.type(screen.getByLabelText("Seu nome"), "Robô");
    await user.type(screen.getByLabelText("Telefone"), "11999990000");
    // O campo é escondido de humanos (fora da tela, aria-hidden) — só um
    // preenchedor automático de formulário chega nele.
    const honeypot = document.querySelector('input[name="website"]') as HTMLInputElement;
    await user.type(honeypot, "http://spam");
    await user.click(screen.getByRole("button", { name: /enviar pedido/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/public/small-groups/sg1/visit-request",
        expect.objectContaining({ website: "http://spam" }),
      );
    });
  });

  it("mostra o erro da API quando o envio falha", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("falhou"));
    const user = await abrirFormulario();

    await user.type(screen.getByLabelText("Seu nome"), "Maria");
    await user.type(screen.getByLabelText("Telefone"), "11999990000");
    await user.click(screen.getByRole("button", { name: /enviar pedido/i }));

    expect(await screen.findByText(/não foi possível enviar seu pedido/i)).toBeInTheDocument();
  });

  it("fecha o formulário no botão de fechar depois do envio", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { status: "received", message: "ok" } });
    const user = await abrirFormulario();

    await user.type(screen.getByLabelText("Seu nome"), "Maria");
    await user.type(screen.getByLabelText("Telefone"), "11999990000");
    await user.click(screen.getByRole("button", { name: /enviar pedido/i }));
    await screen.findByText(/alguém da célula vai falar com você/i);

    // O X do Modal também se chama "Fechar" (aria-label); o daqui é o último,
    // dentro do corpo da janela.
    const fechar = screen.getAllByRole("button", { name: /^fechar$/i });
    await user.click(fechar[fechar.length - 1]);

    await waitFor(() => {
      expect(screen.queryByText(/alguém da célula vai falar com você/i)).not.toBeInTheDocument();
    });
  });
});
