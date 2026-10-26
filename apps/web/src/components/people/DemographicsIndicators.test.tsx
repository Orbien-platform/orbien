import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DemographicsIndicators } from "./DemographicsIndicators";

type Config = { params?: { classification?: string } };

// `get` é uma função comum, não um spy: o spy do Vitest que devolve rejeição
// acusa "unhandled" mesmo com o componente tratando.
const calls: Array<[string, Config | undefined]> = [];
let respond: (config?: Config) => Promise<unknown> = () => Promise.resolve({ data: null });
vi.mock("@/lib/api", () => ({
  default: {
    get: (url: string, config?: Config) => {
      calls.push([url, config]);
      return respond(config);
    },
  },
}));

const everyone = {
  by_gender: { male: 30, female: 70, other: 0, prefer_not_to_say: 0, not_informed: 2 },
  by_age_range: [],
};
const members = {
  by_gender: { male: 0, female: 0, other: 0, prefer_not_to_say: 0, not_informed: 0 },
  by_age_range: [
    { range: "0-2", total: 0 },
    { range: "18-24", total: 10 },
    { range: "25-34", total: 30 },
    { range: "60+", total: 10 },
    { range: "not_informed", total: 3 },
  ],
};

describe("DemographicsIndicators", () => {
  it("mostra pessoas por sexo e membros por faixa etária", async () => {
    calls.length = 0;
    respond = (config) =>
      Promise.resolve({ data: config?.params?.classification === "member" ? members : everyone });
    render(<DemographicsIndicators />);

    expect(await screen.findByText("Feminino")).toBeInTheDocument();
    expect(screen.getByText("Masculino")).toBeInTheDocument();
    expect(screen.getByText("Não informado")).toBeInTheDocument();
    expect(screen.queryByText("Outro")).not.toBeInTheDocument();
    expect(screen.getByText("25 a 34 anos")).toBeInTheDocument();
    expect(screen.getByText("60 anos ou mais")).toBeInTheDocument();
    expect(screen.getByText(/3 membros sem data de nascimento ficam de fora/)).toBeInTheDocument();
    expect(calls).toContainEqual(["/persons/demographics", { params: { classification: "member" } }]);
  });

  it("some quando a API recusa os dois recortes", async () => {
    respond = () => Promise.reject({ response: { status: 403 } });
    const { container } = render(<DemographicsIndicators />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("some quando a resposta não tem o formato esperado", async () => {
    respond = () => Promise.resolve({ data: { services_counted: 0 } });
    const { container } = render(<DemographicsIndicators />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
