import { StrictMode, type ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "./page";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

/**
 * O recharts precisa de layout para renderizar, e o jsdom mede tudo como
 * zero — os gráficos não chegariam ao DOM e as funções passadas a `Tooltip`,
 * `Legend` e `YAxis` nunca rodariam. Os dublês abaixo expõem os dados
 * calculados pela tela e chamam essas funções com um valor de exemplo, que é
 * o que interessa testar aqui: a transformação, não o desenho.
 */
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  PieChart: ({ children }: { children: ReactNode }) => (
    <div data-testid="grafico-pizza">{children}</div>
  ),
  Pie: ({
    data,
    children,
  }: {
    data: { name: string; value: number; key: string }[];
    children: ReactNode;
  }) => (
    <div>
      {data.map((d) => (
        <span key={d.key} data-testid="fatia">
          {d.name}: {d.value}
        </span>
      ))}
      {children}
    </div>
  ),
  Cell: ({ fill }: { fill: string }) => <span data-testid="cor">{fill}</span>,
  BarChart: ({
    data,
    children,
  }: {
    data: { week: string; receita: number; resultado: number }[];
    children: ReactNode;
  }) => (
    <div data-testid="grafico-barras">
      {data.map((d) => (
        <span key={d.week} data-testid="semana">
          {d.week}: {d.receita} / {d.resultado}
        </span>
      ))}
      {children}
    </div>
  ),
  Bar: ({ dataKey }: { dataKey: string }) => <span>barra:{dataKey}</span>,
  XAxis: () => null,
  CartesianGrid: () => null,
  YAxis: ({ tickFormatter }: { tickFormatter?: (v: number) => string }) => (
    <span data-testid="eixo-y">{tickFormatter?.(1500)}</span>
  ),
  Tooltip: ({
    formatter,
  }: {
    formatter?: (v: unknown, n?: unknown) => unknown;
  }) => (
    <>
      <span data-testid="tooltip">
        {JSON.stringify(formatter?.(1234.5, "receita"))}
      </span>
      <span data-testid="tooltip-resultado">
        {JSON.stringify(formatter?.(10, "resultado"))}
      </span>
    </>
  ),
  Legend: ({ formatter }: { formatter?: (v: string) => ReactNode }) => (
    <>
      <span data-testid="legenda">{formatter?.("receita")}</span>
      <span data-testid="legenda-outra">{formatter?.("resultado")}</span>
    </>
  ),
}));

const getMock = vi.mocked(api.get);

/** Quarta-feira, 16/09/2026, meio-dia UTC. */
const AGORA = new Date("2026-09-16T12:00:00.000Z");

function pessoa(overrides: Record<string, unknown> = {}) {
  return {
    id: "p-1",
    full_name: "Ana Silva",
    classification: "member",
    created_at: "2026-09-10T12:00:00.000Z",
    ...overrides,
  };
}

function transacao(overrides: Record<string, unknown> = {}) {
  return {
    id: "t-1",
    type: "income",
    amount: "1000.00",
    occurred_at: "2026-09-15T12:00:00.000Z",
    ...overrides,
  };
}

function celebracao(overrides: Record<string, unknown> = {}) {
  return {
    id: "c-1",
    name: "Culto de domingo",
    type: "service",
    day_of_week: 0,
    start_time: "19:00",
    recurrence: "weekly",
    is_active: true,
    ...overrides,
  };
}

function instancia(overrides: Record<string, unknown> = {}) {
  return {
    id: "i-1",
    scheduled_date: "2026-09-20T12:00:00.000Z",
    celebration: { id: "c-1", name: "Culto de domingo" },
    schedule: { id: "s-1", status: "published" },
    ...overrides,
  };
}

interface Respostas {
  pessoas?: unknown;
  transacoes?: unknown;
  celebracoes?: unknown;
  instancias?: unknown;
}

/** Cada chave pode ser um valor de resposta ou uma promise rejeitada. */
function rotear({
  pessoas,
  transacoes,
  celebracoes,
  instancias,
}: Respostas = {}) {
  const resolver = (valor: unknown, padrao: unknown) =>
    valor instanceof Promise
      ? (valor as never)
      : (Promise.resolve({ data: valor ?? padrao }) as never);

  getMock.mockImplementation((url: string) => {
    if (url.startsWith("/persons")) {
      return resolver(pessoas, { data: [pessoa()], total: 1 });
    }
    if (url.startsWith("/financial/transactions")) {
      return resolver(transacoes, { data: [transacao()], total: 1 });
    }
    if (url === "/celebrations") {
      return resolver(celebracoes, [celebracao()]);
    }
    if (url.startsWith("/celebrations/instances")) {
      return resolver(instancias, [instancia()]);
    }
    throw new Error(`URL inesperada: ${url}`);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(AGORA);
  getMock.mockReset();
  rotear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DashboardPage — carga", () => {
  it("busca as quatro fontes, com a janela de 14 dias nas instâncias", async () => {
    render(<DashboardPage />);

    await screen.findByText("Total de membros");
    const urls = getMock.mock.calls.map(([url]) => url as string);
    expect(urls).toContain("/persons?limit=100");
    expect(urls).toContain("/financial/transactions?limit=100");
    expect(urls).toContain("/celebrations");
    expect(urls).toContain(
      "/celebrations/instances?date_from=2026-09-16&date_to=2026-09-30"
    );
  });

  it("montagem dupla não duplica as buscas", async () => {
    render(
      <StrictMode>
        <DashboardPage />
      </StrictMode>
    );

    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(4));
  });

  it("uma fonte que falha não apaga o resto do dashboard", async () => {
    rotear({ transacoes: Promise.reject(new Error("500")) });

    render(<DashboardPage />);

    // Pessoas carregou (total no KPI); o bloco financeiro fica em zero.
    expect(await screen.findByText("Membros: 1")).toBeInTheDocument();
    expect(screen.getAllByText("0,00").length).toBeGreaterThan(0);
  });

  it("as quatro falhando mostram o erro em vez do dashboard", async () => {
    rotear({
      pessoas: Promise.reject(new Error("500")),
      transacoes: Promise.reject(new Error("500")),
      celebracoes: Promise.reject(new Error("500")),
      instancias: Promise.reject(new Error("500")),
    });

    render(<DashboardPage />);

    expect(
      await screen.findByText("Não foi possível carregar os dados.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Visão geral")).not.toBeInTheDocument();
  });

  it("respostas fora do formato esperado não quebram a tela", async () => {
    rotear({
      transacoes: { total: 0 },
      celebracoes: { message: "nada" },
      instancias: { message: "nada" },
    });

    render(<DashboardPage />);

    expect(
      await screen.findByText("Nenhuma celebração cadastrada.")
    ).toBeInTheDocument();
    // Receita e resultado da semana, ambos zerados.
    expect(screen.getAllByText("0,00")).toHaveLength(2);
  });
});

describe("DashboardPage — KPIs", () => {
  it("total de membros, novos do mês e a quebra por classificação", async () => {
    rotear({
      pessoas: {
        total: 42,
        data: [
          pessoa({ id: "p-1", created_at: "2026-09-02T12:00:00.000Z" }),
          pessoa({
            id: "p-2",
            classification: "visitor",
            created_at: "2026-09-14T12:00:00.000Z",
          }),
          // Mês anterior: entra no total, não nos novos.
          pessoa({ id: "p-3", created_at: "2026-08-20T12:00:00.000Z" }),
        ],
      },
    });

    render(<DashboardPage />);

    expect(await screen.findByText("42")).toBeInTheDocument();
    expect(screen.getByText("+2 este mês")).toBeInTheDocument();
    expect(screen.getByText("1 Membros")).toBeInTheDocument();
    expect(screen.getByText("1 Visitantes")).toBeInTheDocument();
  });

  it("sem novos no mês o delta muda de texto", async () => {
    rotear({
      pessoas: {
        total: 5,
        data: [pessoa({ created_at: "2026-07-01T12:00:00.000Z" })],
      },
    });

    render(<DashboardPage />);

    expect(await screen.findByText("Sem novos este mês")).toBeInTheDocument();
  });

  it("receita da semana com variação sobre a semana anterior", async () => {
    rotear({
      transacoes: {
        total: 4,
        data: [
          // Semana corrente (segunda 14/09 a domingo 20/09).
          transacao({ id: "t-1", amount: "1500.00", occurred_at: "2026-09-15T12:00:00.000Z" }),
          transacao({
            id: "t-2",
            type: "expense",
            amount: "500.00",
            occurred_at: "2026-09-16T10:00:00.000Z",
          }),
          // Semana anterior (07/09 a 13/09).
          transacao({ id: "t-3", amount: "1000.00", occurred_at: "2026-09-08T12:00:00.000Z" }),
          transacao({
            id: "t-4",
            type: "expense",
            amount: "200.00",
            occurred_at: "2026-09-09T12:00:00.000Z",
          }),
        ],
      },
    });

    render(<DashboardPage />);

    expect(await screen.findByText("1.500,00")).toBeInTheDocument();
    expect(screen.getByText("+50% vs semana anterior")).toBeInTheDocument();
    // Resultado da semana: 1500 − 500 = 1000; a anterior fechou em 800.
    expect(screen.getByText("1.000,00")).toBeInTheDocument();
    expect(screen.getByText("+200,00 vs sem. anterior")).toBeInTheDocument();
  });

  it("queda na receita aparece com sinal negativo", async () => {
    rotear({
      transacoes: {
        total: 2,
        data: [
          transacao({ id: "t-1", amount: "500.00", occurred_at: "2026-09-15T12:00:00.000Z" }),
          transacao({ id: "t-2", amount: "1000.00", occurred_at: "2026-09-08T12:00:00.000Z" }),
        ],
      },
    });

    render(<DashboardPage />);

    expect(
      await screen.findByText("-50% vs semana anterior")
    ).toBeInTheDocument();
  });

  it("sem semana anterior não inventa variação", async () => {
    rotear({
      transacoes: {
        total: 1,
        data: [transacao({ occurred_at: "2026-09-15T12:00:00.000Z" })],
      },
    });

    render(<DashboardPage />);

    expect(
      await screen.findByText("Sem dados da semana anterior")
    ).toBeInTheDocument();
    // Semana anterior zerada: o resultado líquido não mostra comparação.
    expect(screen.queryByText(/vs sem\. anterior/)).not.toBeInTheDocument();
  });

  it("resultado negativo com semana anterior positiva sai sem o sinal de mais", async () => {
    rotear({
      transacoes: {
        total: 2,
        data: [
          transacao({
            id: "t-1",
            type: "expense",
            amount: "400.00",
            occurred_at: "2026-09-15T12:00:00.000Z",
          }),
          transacao({
            id: "t-2",
            amount: "600.00",
            occurred_at: "2026-09-08T12:00:00.000Z",
          }),
        ],
      },
    });

    render(<DashboardPage />);

    // −400 nesta semana contra +600 na anterior: delta de −1.000.
    expect(
      await screen.findByText("-1.000,00 vs sem. anterior")
    ).toBeInTheDocument();
  });

  it("resultado negativo troca o prefixo da moeda", async () => {
    rotear({
      transacoes: {
        total: 1,
        data: [
          transacao({
            type: "expense",
            amount: "300.00",
            occurred_at: "2026-09-15T12:00:00.000Z",
          }),
        ],
      },
    });

    render(<DashboardPage />);

    expect(await screen.findByText("−R$")).toBeInTheDocument();
    expect(screen.getByText("300,00")).toBeInTheDocument();
  });
});

describe("DashboardPage — gráficos", () => {
  it("a pizza sai ordenada por volume, com as cores da classificação", async () => {
    rotear({
      pessoas: {
        total: 4,
        data: [
          pessoa({ id: "p-1", classification: "visitor" }),
          pessoa({ id: "p-2", classification: "member" }),
          pessoa({ id: "p-3", classification: "member" }),
          pessoa({ id: "p-4", classification: "attendee" }),
        ],
      },
    });

    render(<DashboardPage />);

    const fatias = await screen.findAllByTestId("fatia");
    expect(fatias.map((f) => f.textContent)).toEqual([
      "Membros: 2",
      "Visitantes: 1",
      "Frequentadores: 1",
    ]);
    expect(screen.getAllByTestId("cor").map((c) => c.textContent)).toEqual([
      "#1E3A7B",
      "#5C5A56",
      "#00B8A2",
    ]);
  });

  it("classificação desconhecida entra com a chave crua e a cor neutra", async () => {
    rotear({
      pessoas: {
        total: 1,
        data: [pessoa({ classification: "guest" })],
      },
    });

    render(<DashboardPage />);

    expect(await screen.findByText("guest: 1")).toBeInTheDocument();
    expect(screen.getByTestId("cor")).toHaveTextContent("#9B9893");
  });

  it("sem pessoas a pizza dá lugar a 'Sem dados'", async () => {
    rotear({ pessoas: { total: 0, data: [] } });

    render(<DashboardPage />);

    expect(await screen.findByText("Sem dados")).toBeInTheDocument();
    expect(screen.queryByTestId("grafico-pizza")).not.toBeInTheDocument();
  });

  it("as barras cobrem as últimas quatro semanas", async () => {
    rotear({
      transacoes: {
        total: 2,
        data: [
          transacao({ id: "t-1", amount: "800.00", occurred_at: "2026-09-15T12:00:00.000Z" }),
          transacao({
            id: "t-2",
            type: "expense",
            amount: "300.00",
            occurred_at: "2026-09-15T12:00:00.000Z",
          }),
        ],
      },
    });

    render(<DashboardPage />);

    const semanas = await screen.findAllByTestId("semana");
    expect(semanas.map((s) => s.textContent)).toEqual([
      "24/08: 0 / 0",
      "31/08: 0 / 0",
      "07/09: 0 / 0",
      "14/09: 800 / 500",
    ]);
  });

  it("as funções de eixo, tooltip e legenda formatam o que recebem", async () => {
    render(<DashboardPage />);

    await screen.findByTestId("grafico-barras");
    expect(screen.getByTestId("eixo-y")).toHaveTextContent("2k");
    // Duas instâncias de Tooltip (pizza e barras): a da pizza devolve o valor
    // cru, a das barras formata em reais e traduz o nome da série.
    const tooltips = screen.getAllByTestId("tooltip").map((t) => t.textContent);
    expect(tooltips).toContain('[1234.5,""]');
    expect(tooltips).toContain('["R$ 1.234,50","Receita"]');
    expect(
      screen.getAllByTestId("tooltip-resultado").map((t) => t.textContent)
    ).toContain('["R$ 10,00","Resultado"]');
    const legendas = screen.getAllByTestId("legenda").map((l) => l.textContent);
    expect(legendas).toContain("receita");
    expect(legendas).toContain("Receita");
    expect(
      screen.getAllByTestId("legenda-outra").map((l) => l.textContent)
    ).toContain("Resultado líquido");
  });
});

describe("DashboardPage — próxima celebração", () => {
  it("escolhe a próxima ocorrência entre as celebrações ativas", async () => {
    rotear({
      celebracoes: [
        // Quinta (17/09) vem antes de domingo (20/09).
        celebracao({ id: "c-1", name: "Culto de domingo", day_of_week: 0 }),
        celebracao({
          id: "c-2",
          name: "Estudo de quinta",
          day_of_week: 4,
          start_time: "20:00",
        }),
        // Inativa: fora da conta.
        celebracao({
          id: "c-3",
          name: "Culto antigo",
          day_of_week: 3,
          is_active: false,
        }),
      ],
    });

    render(<DashboardPage />);

    expect(await screen.findByText("Estudo de quinta")).toBeInTheDocument();
    expect(screen.getByText("quinta-feira, 17/09")).toBeInTheDocument();
    expect(screen.getByText("20:00")).toBeInTheDocument();
  });

  it("celebração que cai hoje aponta para a semana que vem", async () => {
    rotear({
      celebracoes: [
        // Hoje é quarta (day_of_week 3).
        celebracao({ id: "c-1", name: "Culto de quarta", day_of_week: 3 }),
      ],
    });

    render(<DashboardPage />);

    expect(await screen.findByText("Culto de quarta")).toBeInTheDocument();
    expect(screen.getByText("quarta-feira, 23/09")).toBeInTheDocument();
  });

  it("sem celebração ativa o cartão avisa", async () => {
    rotear({ celebracoes: [celebracao({ is_active: false })] });

    render(<DashboardPage />);

    expect(
      await screen.findByText("Nenhuma celebração cadastrada.")
    ).toBeInTheDocument();
  });

  it("conta as escalas publicadas da janela, no singular e no plural", async () => {
    rotear({ instancias: [instancia()] });
    const { unmount } = render(<DashboardPage />);
    expect(await screen.findByText("1 escala publicada")).toBeInTheDocument();
    unmount();

    rotear({
      instancias: [
        instancia({ id: "i-1" }),
        instancia({ id: "i-2", scheduled_date: "2026-09-27T12:00:00.000Z" }),
      ],
    });
    render(<DashboardPage />);
    expect(await screen.findByText("2 escalas publicadas")).toBeInTheDocument();
  });

  it("sem escala publicada o selo muda de texto", async () => {
    rotear({
      instancias: [instancia({ schedule: { id: "s-1", status: "draft" } })],
    });

    render(<DashboardPage />);

    expect(
      await screen.findByText("Sem escalas publicadas")
    ).toBeInTheDocument();
  });

  it("instância fora da janela de 14 dias não conta", async () => {
    rotear({
      instancias: [instancia({ scheduled_date: "2026-10-30T12:00:00.000Z" })],
    });

    render(<DashboardPage />);

    expect(
      await screen.findByText("Sem escalas publicadas")
    ).toBeInTheDocument();
  });
});

describe("DashboardPage — alertas", () => {
  function alertas() {
    return screen
      .getByRole("heading", { name: "Alertas" })
      .closest("div")!.parentElement!;
  }

  it("avisa sobre celebrações sem escala publicada, no plural", async () => {
    rotear({
      instancias: [
        instancia({ id: "i-1", schedule: null }),
        instancia({
          id: "i-2",
          scheduled_date: "2026-09-27T12:00:00.000Z",
          schedule: { id: "s-2", status: "draft" },
        }),
      ],
    });

    render(<DashboardPage />);

    // O texto sai como "2 celebraçãoões": o sufixo do plural é concatenado
    // à palavra já no singular. É um defeito de exibição da tela, não do
    // teste — registrado como achado, sem correção nesta fase.
    expect(await screen.findByText("2 celebraçãoões")).toBeInTheDocument();
    expect(
      screen.getByText(/nos próximos 14 dias sem escala publicada/)
    ).toBeInTheDocument();
  });

  it("uma só celebração pendente fica no singular", async () => {
    rotear({ instancias: [instancia({ schedule: null })] });

    render(<DashboardPage />);

    expect(await screen.findByText("1 celebração")).toBeInTheDocument();
  });

  it("API sem o campo `schedule` deixa o alerta neutro", async () => {
    // Versão anterior ao refactor de escalas: sem o campo não há como
    // distinguir "sem escala" de "API antiga".
    rotear({
      instancias: [
        {
          id: "i-1",
          scheduled_date: "2026-09-20T12:00:00.000Z",
          celebration: { id: "c-1", name: "Culto de domingo" },
        },
      ],
    });

    render(<DashboardPage />);

    await screen.findByText("Alertas");
    expect(
      screen.queryByText(/sem escala publicada/)
    ).not.toBeInTheDocument();
  });

  it("avisa quando não houve novo membro no mês", async () => {
    rotear({
      pessoas: {
        total: 10,
        data: [pessoa({ created_at: "2026-06-01T12:00:00.000Z" })],
      },
    });

    render(<DashboardPage />);

    expect(
      await screen.findByText("Nenhum novo membro este mês.")
    ).toBeInTheDocument();
  });

  it("com tudo em ordem diz que não há alertas", async () => {
    rotear({
      pessoas: {
        total: 10,
        data: [pessoa({ created_at: "2026-09-05T12:00:00.000Z" })],
      },
      instancias: [instancia()],
    });

    render(<DashboardPage />);

    expect(
      await within(alertas()).findByText("Sem alertas no momento.")
    ).toBeInTheDocument();
  });

  it("sem nenhuma pessoa cadastrada não acusa falta de novos membros", async () => {
    rotear({ pessoas: { total: 0, data: [] }, instancias: [instancia()] });

    render(<DashboardPage />);

    await screen.findByText("Alertas");
    expect(
      screen.queryByText("Nenhum novo membro este mês.")
    ).not.toBeInTheDocument();
    expect(screen.getByText("Sem alertas no momento.")).toBeInTheDocument();
  });
});
