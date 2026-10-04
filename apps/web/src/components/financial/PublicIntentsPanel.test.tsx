import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicIntentsPanel } from "./PublicIntentsPanel";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
  isForbidden: (error: unknown) => (error as { response?: { status?: number } })?.response?.status === 403,
}));

function intent(overrides: Record<string, unknown> = {}) {
  return {
    id: "i1",
    reference: "PIX-8C9F9A52",
    amount: "50.00",
    status: "pending",
    mode: "static",
    donor_name: "Ana Silva",
    donor_email: "ana@igreja.com",
    category_name: "Oferta",
    created_at: "2026-10-01T15:00:00Z",
    ...overrides,
  };
}

const page = (rows: unknown[], total = rows.length) => ({ data: { data: rows, total } });
const URL_PENDING = "/financial/pix/public-intents?page=1&page_size=20&status=pending";
const URL_ALL = "/financial/pix/public-intents?page=1&page_size=20";

beforeEach(() => vi.clearAllMocks());

describe("PublicIntentsPanel", () => {
  it("abre nas pendentes e lista referência, doador declarado, valor e situação", async () => {
    vi.mocked(api.get).mockResolvedValue(page([intent()]));
    render(<PublicIntentsPanel />);

    expect(await screen.findByText("PIX-8C9F9A52")).toBeInTheDocument();
    expect(screen.getByText("Ana Silva")).toBeInTheDocument();
    expect(screen.getByText("ana@igreja.com")).toBeInTheDocument();
    expect(screen.getByText(/R\$\s?50,00/)).toBeInTheDocument();
    expect(screen.getByText("Pendente")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(URL_PENDING);
    expect(screen.getByRole("button", { name: "Pendentes" })).toHaveAttribute("aria-pressed", "true");
  });

  it("em StrictMode (efeito roda duas vezes) a lista é buscada uma vez só", async () => {
    vi.mocked(api.get).mockResolvedValue(page([intent()]));
    render(
      <StrictMode>
        <PublicIntentsPanel />
      </StrictMode>,
    );

    await screen.findByText("PIX-8C9F9A52");

    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("doador só com e-mail mostra o e-mail; sem nenhum, 'Anônimo'", async () => {
    vi.mocked(api.get).mockResolvedValue(
      page([
        intent({ id: "i1", reference: "PIX-00000001", donor_name: null }),
        intent({ id: "i2", reference: "PIX-00000002", donor_name: null, donor_email: null }),
      ]),
    );
    render(<PublicIntentsPanel />);

    expect(await screen.findByText("ana@igreja.com")).toBeInTheDocument();
    expect(screen.getByText("Anônimo")).toBeInTheDocument();
  });

  it("estado vazio das pendentes e de todas", async () => {
    vi.mocked(api.get).mockResolvedValue(page([]));
    const user = userEvent.setup();
    render(<PublicIntentsPanel />);

    expect(await screen.findByText("Nenhuma doação pública pendente.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Todas" }));

    expect(await screen.findByText("Nenhuma doação pública ainda.")).toBeInTheDocument();
    expect(api.get).toHaveBeenLastCalledWith(URL_ALL);
  });

  it("trocar para 'Todas' recarrega sem o filtro; clicar de novo na mesma opção não recarrega", async () => {
    vi.mocked(api.get).mockResolvedValue(page([intent()]));
    const user = userEvent.setup();
    render(<PublicIntentsPanel />);
    await screen.findByText("PIX-8C9F9A52");

    await user.click(screen.getByRole("button", { name: "Pendentes" }));
    expect(api.get).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Todas" }));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Todas" })).toHaveAttribute("aria-pressed", "true");
  });

  it("cada situação tem rótulo próprio e só a chave estática pendente tem botão", async () => {
    vi.mocked(api.get).mockResolvedValue(
      page([
        intent({ id: "a", reference: "PIX-AAAAAAAA", status: "pending", mode: "static" }),
        intent({ id: "b", reference: "PIX-BBBBBBBB", status: "confirmed", mode: "static" }),
        intent({ id: "c", reference: "PIX-CCCCCCCC", status: "failed", mode: "static" }),
        intent({ id: "d", reference: "PIX-DDDDDDDD", status: "pending", mode: "dynamic" }),
        intent({ id: "e", reference: "PIX-EEEEEEEE", status: "failed", mode: "dynamic" }),
        intent({ id: "f", reference: "PIX-FFFFFFFF", status: "confirmed", mode: "dynamic" }),
      ]),
    );
    render(<PublicIntentsPanel />);
    await screen.findByText("PIX-AAAAAAAA");

    expect(screen.getAllByText("Pendente")).toHaveLength(2);
    expect(screen.getAllByText("Recebida")).toHaveLength(2);
    expect(screen.getAllByText("Vencida")).toHaveLength(2);
    expect(screen.getAllByText("Confirma sozinha pela Asaas")).toHaveLength(1);
    // Pendente estática e vencida estática podem receber baixa; as demais, não.
    expect(screen.getByRole("button", { name: "Marcar PIX-AAAAAAAA como recebida" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Marcar PIX-CCCCCCCC como recebida" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Marcar .* como recebida/ })).toHaveLength(2);
  });

  describe("baixa manual", () => {
    async function open() {
      vi.mocked(api.get).mockResolvedValue(page([intent()]));
      const user = userEvent.setup();
      const onSettled = vi.fn();
      render(<PublicIntentsPanel onSettled={onSettled} />);
      await user.click(await screen.findByRole("button", { name: "Marcar PIX-8C9F9A52 como recebida" }));
      return { user, onSettled };
    }

    it("pede confirmação com o valor na tela antes de enviar — nada é enviado no primeiro clique", async () => {
      await open();

      expect(screen.getByRole("button", { name: /Confirmar R\$\s?50,00/ })).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });

    it("cancelar volta ao botão original sem enviar", async () => {
      const { user } = await open();

      await user.click(screen.getByRole("button", { name: "Cancelar" }));

      expect(screen.getByRole("button", { name: "Marcar PIX-8C9F9A52 como recebida" })).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });

    it("confirmar envia a baixa, avisa, recarrega a lista e avisa o financeiro para atualizar", async () => {
      vi.mocked(api.post).mockResolvedValue({ data: { id: "i1", status: "confirmed" } });
      const { user, onSettled } = await open();
      vi.mocked(api.get).mockResolvedValue(page([]));

      await user.click(screen.getByRole("button", { name: /Confirmar R\$\s?50,00/ }));

      expect(api.post).toHaveBeenCalledWith("/financial/pix/public-intents/i1/settle");
      expect(await screen.findByRole("status")).toHaveTextContent(
        "Baixa de PIX-8C9F9A52 registrada. O lançamento já está no financeiro.",
      );
      await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
      expect(onSettled).toHaveBeenCalledTimes(1);
      expect(await screen.findByText("Nenhuma doação pública pendente.")).toBeInTheDocument();
    });

    it("funciona sem o callback onSettled", async () => {
      vi.mocked(api.post).mockResolvedValue({ data: { id: "i1", status: "confirmed" } });
      vi.mocked(api.get).mockResolvedValue(page([intent()]));
      const user = userEvent.setup();
      render(<PublicIntentsPanel />);
      await user.click(await screen.findByRole("button", { name: "Marcar PIX-8C9F9A52 como recebida" }));

      await user.click(screen.getByRole("button", { name: /Confirmar/ }));

      expect(await screen.findByRole("status")).toBeInTheDocument();
    });

    it("erro do servidor mostra a mensagem em português e mantém a confirmação aberta para tentar de novo", async () => {
      vi.mocked(api.post).mockRejectedValue({
        isAxiosError: true,
        response: { status: 409, data: { message: "Esta doação tem QR code da Asaas e se confirma sozinha" } },
      });
      const { user } = await open();

      await user.click(screen.getByRole("button", { name: /Confirmar/ }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Esta doação tem QR code da Asaas");
      expect(screen.getByRole("button", { name: /Confirmar/ })).toBeEnabled();
    });

    it("erro sem resposta usa a mensagem padrão", async () => {
      vi.mocked(api.post).mockRejectedValue(new Error("Network Error"));
      const { user } = await open();

      await user.click(screen.getByRole("button", { name: /Confirmar/ }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível dar baixa. Tente de novo.");
    });

    it("enquanto envia, não deixa confirmar nem cancelar de novo", async () => {
      let resolver!: (v: unknown) => void;
      vi.mocked(api.post).mockReturnValue(new Promise((r) => (resolver = r)) as never);
      const { user } = await open();

      await user.click(screen.getByRole("button", { name: /Confirmar/ }));

      expect(screen.getByRole("button", { name: /Confirmar/ })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
      resolver({ data: {} });
    });

    it("trocar o filtro limpa a confirmação aberta e os avisos", async () => {
      vi.mocked(api.post).mockRejectedValue(new Error("x"));
      const { user } = await open();
      await user.click(screen.getByRole("button", { name: /Confirmar/ }));
      await screen.findByRole("alert");

      await user.click(screen.getByRole("button", { name: "Todas" }));

      await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
      expect(screen.queryByRole("button", { name: /Confirmar/ })).not.toBeInTheDocument();
    });
  });

  it("403 mostra o estado de sem acesso", async () => {
    vi.mocked(api.get).mockRejectedValue({ isAxiosError: true, response: { status: 403 } });
    render(<PublicIntentsPanel />);

    expect(await screen.findByText(/Você não tem acesso a Doações públicas/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pendentes" })).not.toBeInTheDocument();
  });

  it("erro de carga mostra a mensagem e o 'tentar de novo' recarrega", async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error("falhou")).mockResolvedValueOnce(page([intent()]));
    const user = userEvent.setup();
    render(<PublicIntentsPanel />);

    expect(await screen.findByText("Erro ao carregar as doações públicas.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /tentar/i }));

    expect(await screen.findByText("PIX-8C9F9A52")).toBeInTheDocument();
  });

  it("pagina quando há mais de 20", async () => {
    vi.mocked(api.get).mockResolvedValue(page([intent()], 45));
    const user = userEvent.setup();
    render(<PublicIntentsPanel />);
    await screen.findByText("PIX-8C9F9A52");

    expect(screen.getByText("Página 1 de 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Página anterior" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Próxima página" }));
    await waitFor(() =>
      expect(api.get).toHaveBeenLastCalledWith(
        "/financial/pix/public-intents?page=2&page_size=20&status=pending",
      ),
    );
    await screen.findByText("Página 2 de 3");

    await user.click(screen.getByRole("button", { name: "Página anterior" }));
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith(URL_PENDING));
  });

  it("sem paginação até 20 itens", async () => {
    vi.mocked(api.get).mockResolvedValue(page([intent()], 20));
    render(<PublicIntentsPanel />);
    await screen.findByText("PIX-8C9F9A52");

    expect(screen.queryByText(/Página 1 de/)).not.toBeInTheDocument();
  });

  it("a linha mostra a data em horário de Brasília", async () => {
    vi.mocked(api.get).mockResolvedValue(page([intent({ created_at: "2026-10-01T15:00:00Z" })]));
    render(<PublicIntentsPanel />);

    const row = (await screen.findByText("PIX-8C9F9A52")).closest("tr")!;
    expect(within(row).getByText(/01\/10,? 12:00/)).toBeInTheDocument();
  });
});
