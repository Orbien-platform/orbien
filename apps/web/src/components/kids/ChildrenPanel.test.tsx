import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchChildren } from "@/lib/kids";
import { ChildrenPanel } from "./ChildrenPanel";

vi.mock("@/lib/api", () => ({
  isForbidden: (error: unknown) => (error as { response?: { status?: number } })?.response?.status === 403,
  default: {},
}));
vi.mock("@/lib/kids", async (orig) => ({
  ...(await orig<typeof import("@/lib/kids")>()),
  searchChildren: vi.fn(),
}));
vi.mock("@/components/kids/ChildFicha", () => ({
  ChildFicha: ({ childId, onBack, onChanged }: { childId: string; onBack: () => void; onChanged: () => void }) => (
    <div data-testid="ficha">
      ficha:{childId}
      <button onClick={onBack}>voltar da ficha</button>
      <button onClick={onChanged}>mudou</button>
    </div>
  ),
}));
vi.mock("@/components/kids/ChildFormModal", () => ({
  ChildFormModal: ({ onSaved, onOpenChange }: { onSaved: (id: string) => void; onOpenChange: (o: boolean) => void }) => (
    <div data-testid="child-form">
      <button onClick={() => onSaved("novo-id")}>cadastrou</button>
      <button onClick={() => onOpenChange(false)}>fechou</button>
    </div>
  ),
}));

const httpError = (status: number) => Object.assign(new Error("x"), { isAxiosError: true, response: { status } });
const DAVI = { id: "k1", full_name: "Davi Souza", birth_date: "2022-03-10T00:00:00.000Z", household_id: "h1" };

describe("ChildrenPanel", () => {
  beforeEach(() => {
    vi.mocked(searchChildren).mockReset();
  });

  it("lista as crianças com idade e sem data de nascimento quando falta", async () => {
    vi.mocked(searchChildren).mockResolvedValue([DAVI, { ...DAVI, id: "k2", full_name: "Bia", birth_date: null }]);
    render(<ChildrenPanel canManage />);
    expect(await screen.findByText("Davi Souza")).toBeInTheDocument();
    expect(screen.getByText("Sem data de nascimento")).toBeInTheDocument();
  });

  it("estado vazio convida a cadastrar", async () => {
    vi.mocked(searchChildren).mockResolvedValue([]);
    render(<ChildrenPanel canManage />);
    expect(await screen.findByText("Nenhuma criança cadastrada")).toBeInTheDocument();
  });

  it("busca por nome e diferencia ‘ninguém com esse nome’ de ‘nenhuma cadastrada’", async () => {
    const user = userEvent.setup();
    vi.mocked(searchChildren).mockResolvedValueOnce([DAVI]).mockResolvedValue([]);
    render(<ChildrenPanel canManage />);
    await screen.findByText("Davi Souza");
    await user.type(screen.getByPlaceholderText("Buscar criança pelo nome"), "zé");
    expect(await screen.findByText("Nenhuma criança com esse nome")).toBeInTheDocument();
    expect(searchChildren).toHaveBeenLastCalledWith("zé");
  });

  it("falha de carga é erro com nova tentativa, não lista vazia", async () => {
    const user = userEvent.setup();
    vi.mocked(searchChildren).mockRejectedValueOnce(httpError(500)).mockResolvedValueOnce([DAVI]);
    render(<ChildrenPanel canManage />);
    expect(await screen.findByText("Não foi possível carregar as crianças.")).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma criança cadastrada")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Tentar de novo/ }));
    expect(await screen.findByText("Davi Souza")).toBeInTheDocument();
  });

  it("403 diz que falta acesso", async () => {
    vi.mocked(searchChildren).mockRejectedValue(httpError(403));
    render(<ChildrenPanel canManage />);
    expect(await screen.findByText(/Você não tem acesso a Crianças/)).toBeInTheDocument();
  });

  it("abre a ficha ao clicar e volta para a lista; mudança na ficha recarrega a lista", async () => {
    const user = userEvent.setup();
    vi.mocked(searchChildren).mockResolvedValue([DAVI]);
    render(<ChildrenPanel canManage />);
    await user.click(await screen.findByText("Davi Souza"));
    expect(screen.getByTestId("ficha")).toHaveTextContent("ficha:k1");
    await user.click(screen.getByRole("button", { name: "mudou" }));
    await waitFor(() => expect(searchChildren).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole("button", { name: "voltar da ficha" }));
    expect(await screen.findByText("Davi Souza")).toBeInTheDocument();
  });

  it("cadastra uma criança e já abre a ficha dela", async () => {
    const user = userEvent.setup();
    vi.mocked(searchChildren).mockResolvedValue([]);
    render(<ChildrenPanel canManage />);
    await user.click(await screen.findByRole("button", { name: "Nova criança" }));
    await user.click(screen.getByRole("button", { name: "fechou" }));
    expect(screen.queryByTestId("child-form")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Nova criança" }));
    await user.click(screen.getByRole("button", { name: "cadastrou" }));
    expect(screen.getByTestId("ficha")).toHaveTextContent("ficha:novo-id");
  });

  it("quem não gerencia não cadastra", async () => {
    vi.mocked(searchChildren).mockResolvedValue([DAVI]);
    render(<ChildrenPanel canManage={false} />);
    await screen.findByText("Davi Souza");
    expect(screen.queryByRole("button", { name: "Nova criança" })).not.toBeInTheDocument();
  });

  describe("resposta de uma busca que já foi trocada", () => {
    const deferred = <T,>() => {
      let resolve!: (v: T) => void;
      let reject!: (e: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };

    it("não sobrescreve a lista da busca atual quando chega depois dela", async () => {
      const user = userEvent.setup();
      const antiga = deferred<(typeof DAVI)[]>();
      vi.mocked(searchChildren)
        .mockReturnValueOnce(antiga.promise)
        .mockResolvedValue([{ ...DAVI, id: "k9", full_name: "Zeca Atual" }]);
      render(<ChildrenPanel canManage />);
      await user.type(screen.getByPlaceholderText("Buscar criança pelo nome"), "z");
      expect(await screen.findByText("Zeca Atual")).toBeInTheDocument();

      antiga.resolve([DAVI]);
      await waitFor(() => expect(screen.queryByText("Davi Souza")).not.toBeInTheDocument());
      expect(screen.getByText("Zeca Atual")).toBeInTheDocument();
    });

    it("falha tardia da busca antiga não derruba a lista da busca atual", async () => {
      const user = userEvent.setup();
      const antiga = deferred<(typeof DAVI)[]>();
      vi.mocked(searchChildren)
        .mockReturnValueOnce(antiga.promise)
        .mockResolvedValue([{ ...DAVI, id: "k9", full_name: "Zeca Atual" }]);
      render(<ChildrenPanel canManage />);
      await user.type(screen.getByPlaceholderText("Buscar criança pelo nome"), "z");
      expect(await screen.findByText("Zeca Atual")).toBeInTheDocument();

      antiga.reject(httpError(500));
      await waitFor(() => expect(searchChildren).toHaveBeenCalledTimes(2));
      expect(screen.queryByText("Não foi possível carregar as crianças.")).not.toBeInTheDocument();
      expect(screen.getByText("Zeca Atual")).toBeInTheDocument();
    });
  });
});
