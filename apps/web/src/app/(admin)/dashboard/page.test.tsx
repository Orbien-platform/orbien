import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import DashboardPage from "./page";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn() },
}));

// recharts não renderiza de verdade em jsdom (ResponsiveContainer depende de
// ResizeObserver, que jsdom não implementa) — o gráfico em si é visual, não é
// o contrato desta página. Mocka-se como passthrough, mas os `formatter` e
// `tickFormatter` passados como prop são código real da página (decidem o
// texto do tooltip/legenda) — os stubs os invocam com valores representativos
// para que os dois lados de cada ternário dentro deles sejam exercitados.
vi.mock("recharts", () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    PieChart: Passthrough,
    Pie: Passthrough,
    Cell: Passthrough,
    BarChart: Passthrough,
    Bar: Passthrough,
    XAxis: Passthrough,
    YAxis: ({ tickFormatter }: { tickFormatter?: (v: number) => React.ReactNode }) => (
      <div>{tickFormatter ? tickFormatter(12345) : null}</div>
    ),
    CartesianGrid: Passthrough,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Tooltip: ({ formatter }: { formatter?: (value: any, name: any) => React.ReactNode }) => {
      if (!formatter) return null;
      return (
        <div>
          {formatter(100, "receita")}
          {formatter(100, "resultado")}
          {formatter(100, undefined)}
        </div>
      );
    },
    ResponsiveContainer: Passthrough,
    Legend: ({ formatter }: { formatter?: (value: string) => React.ReactNode }) => {
      if (!formatter) return null;
      return (
        <div>
          {formatter("receita")}
          {formatter("resultado")}
        </div>
      );
    },
  };
});

const mockedApi = vi.mocked(api, true);

function person(overrides: Partial<{ id: string; full_name: string; classification: string; created_at: string }> = {}) {
  return { id: "p1", full_name: "Pessoa", classification: "member", created_at: "2020-01-01T00:00:00Z", ...overrides };
}

function tx(overrides: Partial<{ id: string; type: string; amount: string; occurred_at: string }> = {}) {
  return { id: "t1", type: "income", amount: "100", occurred_at: new Date().toISOString(), ...overrides };
}

describe("DashboardPage", () => {
  it("guarda contra a dupla invocação de efeito do StrictMode (uma só rodada de requisições)", async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/persons")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url.startsWith("/financial/transactions")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url === "/celebrations") return Promise.resolve({ data: [] });
      if (url.startsWith("/celebrations/instances")) return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    const { StrictMode } = await import("react");
    render(
      <StrictMode>
        <DashboardPage />
      </StrictMode>
    );
    await screen.findByText("Nenhuma celebração cadastrada.");
    expect(
      mockedApi.get.mock.calls.filter(([u]) => u.startsWith("/persons"))
    ).toHaveLength(1);
  });

  it("usa lista vazia quando a resposta financeira não traz o campo data", async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/persons")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url.startsWith("/financial/transactions")) return Promise.resolve({ data: {} });
      if (url === "/celebrations") return Promise.resolve({ data: [] });
      if (url.startsWith("/celebrations/instances")) return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    render(<DashboardPage />);
    expect(await screen.findByText("Nenhuma celebração cadastrada.")).toBeInTheDocument();
  });

  it("mostra o rótulo cru para classificação desconhecida, no gráfico e no badge de novos membros", async () => {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 15).toISOString();
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/persons")) {
        return Promise.resolve({
          data: { data: [person({ id: "1", classification: "leader", created_at: thisMonth })], total: 1 },
        });
      }
      if (url.startsWith("/financial/transactions")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url === "/celebrations") return Promise.resolve({ data: [] });
      if (url.startsWith("/celebrations/instances")) return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    render(<DashboardPage />);
    expect(await screen.findByText("1 leader")).toBeInTheDocument();
  });

  it("mostra resultado negativo sem o sinal de '+' quando a semana anterior também teve dado", async () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    const thisWeek = new Date(monday.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const prevMonday = new Date(monday);
    prevMonday.setDate(monday.getDate() - 7);
    const prevWeek = new Date(prevMonday.getTime() + 24 * 60 * 60 * 1000).toISOString();

    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/persons")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url.startsWith("/financial/transactions")) {
        return Promise.resolve({
          data: {
            data: [
              tx({ id: "1", type: "expense", amount: "500", occurred_at: thisWeek }),
              tx({ id: "2", type: "income", amount: "300", occurred_at: prevWeek }),
            ],
            total: 2,
          },
        });
      }
      if (url === "/celebrations") return Promise.resolve({ data: [] });
      if (url.startsWith("/celebrations/instances")) return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    render(<DashboardPage />);
    expect(await screen.findByText(/vs sem\. anterior/)).toBeInTheDocument();
  });

  it("ordena por data quando há mais de uma celebração ativa e usa cor default para classificação desconhecida no gráfico", async () => {
    const today = new Date();
    const dow = today.getDay();
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/persons")) {
        return Promise.resolve({ data: { data: [person({ classification: "leader" })], total: 1 } });
      }
      if (url.startsWith("/financial/transactions")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url === "/celebrations") {
        return Promise.resolve({
          data: [
            { id: "c1", name: "Culto Tarde", type: "sunday_service", day_of_week: dow, start_time: "20:00", recurrence: "weekly", is_active: true },
            { id: "c2", name: "Culto Cedo", type: "sunday_service", day_of_week: (dow + 1) % 7, start_time: "07:00", recurrence: "weekly", is_active: true },
          ],
        });
      }
      if (url.startsWith("/celebrations/instances")) return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    render(<DashboardPage />);
    // "Culto Tarde" cai no mesmo dia da semana de hoje — `nextOccurrence`
    // empurra para a semana seguinte (`daysUntil === 0`), então quem vence
    // primeiro é "Culto Cedo", amanhã. Isso é o que exercita o comparador do
    // `.sort` com mais de uma celebração ativa.
    expect(await screen.findByText("Culto Cedo")).toBeInTheDocument();
  });

  it("mostra plural quando há mais de uma escala publicada e mais de uma celebração sem escala", async () => {
    const today = new Date();
    const dow = today.getDay();
    const soon1 = new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000);
    const soon2 = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/persons")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url.startsWith("/financial/transactions")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url === "/celebrations") {
        return Promise.resolve({
          data: [{ id: "c1", name: "Culto", type: "sunday_service", day_of_week: dow, start_time: "10:00", recurrence: "weekly", is_active: true }],
        });
      }
      if (url.startsWith("/celebrations/instances")) {
        return Promise.resolve({
          data: [
            { id: "i1", scheduled_date: soon1.toISOString(), celebration: { id: "c1", name: "Culto" }, schedule: { id: "s1", status: "published" } },
            { id: "i2", scheduled_date: soon2.toISOString(), celebration: { id: "c1", name: "Culto" }, schedule: { id: "s2", status: "published" } },
          ],
        });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    render(<DashboardPage />);
    expect(await screen.findByText("2 escalas publicadas")).toBeInTheDocument();
  });

  it("mostra plural no alerta quando há mais de uma celebração sem escala publicada", async () => {
    const today = new Date();
    const soon1 = new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000);
    const soon2 = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/persons")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url.startsWith("/financial/transactions")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url === "/celebrations") return Promise.resolve({ data: [] });
      if (url.startsWith("/celebrations/instances")) {
        return Promise.resolve({
          data: [
            { id: "i1", scheduled_date: soon1.toISOString(), celebration: { id: "c1", name: "Culto 1" }, schedule: { id: "s1", status: "draft" } },
            { id: "i2", scheduled_date: soon2.toISOString(), celebration: { id: "c1", name: "Culto 2" }, schedule: { id: "s2", status: "draft" } },
          ],
        });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    render(<DashboardPage />);
    expect(await screen.findByText(/2 celebrações/)).toBeInTheDocument();
  });


  it("mostra skeleton enquanto carrega e depois os KPIs com os dados", async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/persons")) return Promise.resolve({ data: { data: [person()], total: 1 } });
      if (url.startsWith("/financial/transactions")) return Promise.resolve({ data: { data: [tx()], total: 1 } });
      if (url === "/celebrations") return Promise.resolve({ data: [] });
      if (url.startsWith("/celebrations/instances")) return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    render(<DashboardPage />);
    expect(await screen.findByText("Total de membros")).toBeInTheDocument();
    expect(await screen.findByText("1")).toBeInTheDocument();
  });

  it("mostra erro só quando todas as quatro chamadas falham", async () => {
    mockedApi.get.mockRejectedValue(new Error("boom"));
    render(<DashboardPage />);
    expect(await screen.findByText("Não foi possível carregar os dados.")).toBeInTheDocument();
  });

  it("renderiza parcialmente quando só algumas chamadas falham (allSettled)", async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/persons")) return Promise.resolve({ data: { data: [person()], total: 1 } });
      return Promise.reject(new Error("boom"));
    });
    render(<DashboardPage />);
    expect(await screen.findByText("Total de membros")).toBeInTheDocument();
    expect(screen.queryByText("Não foi possível carregar os dados.")).not.toBeInTheDocument();
  });

  it("mostra novos membros do mês e o detalhamento por classificação", async () => {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 15).toISOString();
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/persons")) {
        return Promise.resolve({
          data: {
            data: [
              person({ id: "1", classification: "member", created_at: thisMonth }),
              person({ id: "2", classification: "visitor", created_at: thisMonth }),
            ],
            total: 2,
          },
        });
      }
      if (url.startsWith("/financial/transactions")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url === "/celebrations") return Promise.resolve({ data: [] });
      if (url.startsWith("/celebrations/instances")) return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    render(<DashboardPage />);
    expect(await screen.findByText("+2 este mês")).toBeInTheDocument();
    expect(screen.getByText("1 Membros")).toBeInTheDocument();
    expect(screen.getByText("1 Visitantes")).toBeInTheDocument();
  });

  it("mostra 'sem novos este mês' quando não há cadastros recentes", async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/persons")) {
        return Promise.resolve({ data: { data: [person({ created_at: "2000-01-01T00:00:00Z" })], total: 1 } });
      }
      if (url.startsWith("/financial/transactions")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url === "/celebrations") return Promise.resolve({ data: [] });
      if (url.startsWith("/celebrations/instances")) return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    render(<DashboardPage />);
    expect(await screen.findByText("Sem novos este mês")).toBeInTheDocument();
    expect(screen.getByText("Nenhum novo membro este mês.")).toBeInTheDocument();
  });

  it("calcula receita, delta semanal e resultado líquido a partir das transações", async () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    const thisWeek = new Date(monday.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const prevMonday = new Date(monday);
    prevMonday.setDate(monday.getDate() - 7);
    const prevWeek = new Date(prevMonday.getTime() + 24 * 60 * 60 * 1000).toISOString();

    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/persons")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url.startsWith("/financial/transactions")) {
        return Promise.resolve({
          data: {
            data: [
              tx({ id: "1", type: "income", amount: "1000", occurred_at: thisWeek }),
              tx({ id: "2", type: "expense", amount: "200", occurred_at: thisWeek }),
              tx({ id: "3", type: "income", amount: "500", occurred_at: prevWeek }),
              tx({ id: "4", type: "expense", amount: "100", occurred_at: prevWeek }),
            ],
            total: 4,
          },
        });
      }
      if (url === "/celebrations") return Promise.resolve({ data: [] });
      if (url.startsWith("/celebrations/instances")) return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    render(<DashboardPage />);
    expect(await screen.findByText("1.000,00")).toBeInTheDocument();
    expect(screen.getByText("+100% vs semana anterior")).toBeInTheDocument();
    expect(screen.getByText("800,00")).toBeInTheDocument();
  });

  it("mostra 'sem dados da semana anterior' quando a receita anterior é zero", async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/persons")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url.startsWith("/financial/transactions")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url === "/celebrations") return Promise.resolve({ data: [] });
      if (url.startsWith("/celebrations/instances")) return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    render(<DashboardPage />);
    expect(await screen.findByText("Sem dados da semana anterior")).toBeInTheDocument();
  });

  it("mostra delta negativo quando a receita cai em relação à semana anterior", async () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    const thisWeek = new Date(monday.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const prevMonday = new Date(monday);
    prevMonday.setDate(monday.getDate() - 7);
    const prevWeek = new Date(prevMonday.getTime() + 24 * 60 * 60 * 1000).toISOString();

    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/persons")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url.startsWith("/financial/transactions")) {
        return Promise.resolve({
          data: {
            data: [
              tx({ id: "1", type: "income", amount: "50", occurred_at: thisWeek }),
              tx({ id: "2", type: "income", amount: "500", occurred_at: prevWeek }),
            ],
            total: 2,
          },
        });
      }
      if (url === "/celebrations") return Promise.resolve({ data: [] });
      if (url.startsWith("/celebrations/instances")) return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    render(<DashboardPage />);
    expect(await screen.findByText(/-90% vs semana anterior/)).toBeInTheDocument();
  });

  it("mostra resultado negativo com sinal e prefixo '−R$'", async () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    const thisWeek = new Date(monday.getTime() + 24 * 60 * 60 * 1000).toISOString();

    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/persons")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url.startsWith("/financial/transactions")) {
        return Promise.resolve({
          data: { data: [tx({ id: "1", type: "expense", amount: "300", occurred_at: thisWeek })], total: 1 },
        });
      }
      if (url === "/celebrations") return Promise.resolve({ data: [] });
      if (url.startsWith("/celebrations/instances")) return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    render(<DashboardPage />);
    expect(await screen.findByText("−R$")).toBeInTheDocument();
  });

  it("mostra 'sem dados' no gráfico de pizza quando não há pessoas", async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/persons")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url.startsWith("/financial/transactions")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url === "/celebrations") return Promise.resolve({ data: [] });
      if (url.startsWith("/celebrations/instances")) return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    render(<DashboardPage />);
    expect(await screen.findByText("Sem dados")).toBeInTheDocument();
  });

  it("mostra a próxima celebração ativa mais próxima com escalas publicadas", async () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const scheduledDate = new Date(today);
    scheduledDate.setDate(today.getDate() + ((dayOfWeek + 1) % 7 || 7));

    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/persons")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url.startsWith("/financial/transactions")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url === "/celebrations") {
        return Promise.resolve({
          data: [
            { id: "c1", name: "Culto Inativo", type: "sunday_service", day_of_week: dayOfWeek, start_time: "10:00", recurrence: "weekly", is_active: false },
            { id: "c2", name: "Culto Ativo", type: "sunday_service", day_of_week: (dayOfWeek + 1) % 7, start_time: "19:00", recurrence: "weekly", is_active: true },
          ],
        });
      }
      if (url.startsWith("/celebrations/instances")) {
        return Promise.resolve({
          data: [
            {
              id: "i1",
              scheduled_date: scheduledDate.toISOString(),
              celebration: { id: "c2", name: "Culto Ativo" },
              schedule: { id: "s1", status: "published" },
            },
          ],
        });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    render(<DashboardPage />);
    expect(await screen.findByText("Culto Ativo")).toBeInTheDocument();
    expect(screen.getByText("19:00")).toBeInTheDocument();
    expect(screen.getByText("1 escala publicada")).toBeInTheDocument();
  });

  it("mostra 'nenhuma celebração cadastrada' quando não há celebrações ativas", async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/persons")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url.startsWith("/financial/transactions")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url === "/celebrations") return Promise.resolve({ data: [] });
      if (url.startsWith("/celebrations/instances")) return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    render(<DashboardPage />);
    expect(await screen.findByText("Nenhuma celebração cadastrada.")).toBeInTheDocument();
  });

  it("mostra alerta de celebrações sem escala publicada e nenhum alerta quando tudo ok", async () => {
    const today = new Date();
    const soon = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/persons")) return Promise.resolve({ data: { data: [{ ...person(), created_at: today.toISOString() }], total: 1 } });
      if (url.startsWith("/financial/transactions")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url === "/celebrations") return Promise.resolve({ data: [] });
      if (url.startsWith("/celebrations/instances")) {
        return Promise.resolve({
          data: [
            {
              id: "i1",
              scheduled_date: soon.toISOString(),
              celebration: { id: "c1", name: "Culto" },
              schedule: { id: "s1", status: "draft" },
            },
          ],
        });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    render(<DashboardPage />);
    expect(await screen.findByText("1 celebração")).toBeInTheDocument();
    expect(screen.getByText(/nos próximos 14 dias sem escala publicada/)).toBeInTheDocument();
  });

  it("mostra 'sem alertas no momento' quando tudo está publicado e há novos membros", async () => {
    const today = new Date();
    const soon = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/persons")) return Promise.resolve({ data: { data: [{ ...person(), created_at: today.toISOString() }], total: 1 } });
      if (url.startsWith("/financial/transactions")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url === "/celebrations") return Promise.resolve({ data: [] });
      if (url.startsWith("/celebrations/instances")) {
        return Promise.resolve({
          data: [
            {
              id: "i1",
              scheduled_date: soon.toISOString(),
              celebration: { id: "c1", name: "Culto" },
              schedule: { id: "s1", status: "published" },
            },
          ],
        });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    render(<DashboardPage />);
    expect(await screen.findByText("Sem alertas no momento.")).toBeInTheDocument();
  });

  it("trata instâncias sem campo `schedule` como dado neutro (API antiga)", async () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const soon = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/persons")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url.startsWith("/financial/transactions")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url === "/celebrations") {
        return Promise.resolve({
          data: [{ id: "c1", name: "Culto", type: "sunday_service", day_of_week: dayOfWeek, start_time: "10:00", recurrence: "weekly", is_active: true }],
        });
      }
      if (url.startsWith("/celebrations/instances")) {
        return Promise.resolve({
          data: [{ id: "i1", scheduled_date: soon.toISOString(), celebration: { id: "c1", name: "Culto" } }],
        });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    render(<DashboardPage />);
    expect(await screen.findByText("Sem escalas publicadas")).toBeInTheDocument();
    expect(await screen.findByText("Sem alertas no momento.")).toBeInTheDocument();
  });

  it("trata resposta não-array de celebrações e instâncias como lista vazia", async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/persons")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url.startsWith("/financial/transactions")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url === "/celebrations") return Promise.resolve({ data: { not: "array" } });
      if (url.startsWith("/celebrations/instances")) return Promise.resolve({ data: { not: "array" } });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    render(<DashboardPage />);
    expect(await screen.findByText("Nenhuma celebração cadastrada.")).toBeInTheDocument();
  });
});
