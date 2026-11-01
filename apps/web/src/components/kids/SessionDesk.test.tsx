import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRoster, searchChildren, type KidsRoster, type KidsRosterItem } from "@/lib/kids";
import { SessionDesk } from "./SessionDesk";

vi.mock("@/lib/api", () => ({
  isForbidden: (error: unknown) => (error as { response?: { status?: number } })?.response?.status === 403,
  default: {},
}));
vi.mock("@/lib/kids", async (orig) => ({
  ...(await orig<typeof import("@/lib/kids")>()),
  getRoster: vi.fn(),
  searchChildren: vi.fn(),
}));
vi.mock("@/components/kids/CheckinDialog", () => ({
  CheckinDialog: ({ child, roomName, onClose, onCheckedIn }: { child: { full_name: string }; roomName: string; onClose: () => void; onCheckedIn: () => void }) => (
    <div data-testid="checkin">
      checkin:{child.full_name}:{roomName}
      <button onClick={onCheckedIn}>feito</button>
      <button onClick={onClose}>fechar checkin</button>
    </div>
  ),
}));
vi.mock("@/components/kids/QrDesk", () => ({
  QrDesk: ({ roomName, items, onCheckedIn, onCheckout }: { roomName: string; items: KidsRosterItem[]; onCheckedIn: () => void; onCheckout: (i: KidsRosterItem, qr: string) => void }) => (
    <div data-testid="qrdesk">
      qrdesk:{roomName}:{items.length}
      <button onClick={onCheckedIn}>qr check-in feito</button>
      <button onClick={() => onCheckout(items[0], "kidsco1.qr")}>qr check-out lido</button>
    </div>
  ),
}));
vi.mock("@/components/kids/CheckoutDialog", () => ({
  CheckoutDialog: ({ item, canOverride, initialQr, refusals, onRefused, onClose, onDone }: { item: KidsRosterItem; canOverride: boolean; initialQr?: string; refusals?: number; onRefused?: (n: number) => void; onClose: () => void; onDone: () => void }) => (
    <div data-testid="checkout">
      checkout:{item.child.full_name}:{String(canOverride)}:qr={initialQr ?? "-"}:refusals={refusals}
      <button onClick={() => onRefused?.((refusals ?? 0) + 1)}>recusou</button>
      <button onClick={onDone}>entregou</button>
      <button onClick={onClose}>fechar checkout</button>
    </div>
  ),
}));

const item = (id: string, name: string, allergies: string | null = null): KidsRosterItem => ({
  checkin_id: `c-${id}`,
  checked_in_at: "2026-10-25T13:05:00.000Z",
  age_override: false,
  child: { id, full_name: name, birth_date: "2022-03-10T00:00:00.000Z" },
  guardian: { person_id: "p1", full_name: "Maria Souza" },
  has_allergy: allergies !== null,
  allergies,
});
const roster = (items: KidsRosterItem[], capacity: number | null = 12): KidsRoster => ({
  session: { id: "s1", status: "open", celebration_instance_id: "i1", room: { id: "r1", name: "Maternal", capacity } },
  present_count: items.length,
  items,
});
const httpError = (status: number) => Object.assign(new Error("x"), { isAxiosError: true, response: { status } });
const DAVI = { id: "k1", full_name: "Davi Souza", birth_date: "2022-03-10T00:00:00.000Z", household_id: "h1" };

describe("SessionDesk", () => {
  beforeEach(() => {
    vi.mocked(getRoster).mockReset();
    vi.mocked(searchChildren).mockReset();
  });

  it("lista os presentes com a alergia em texto e sem código", async () => {
    vi.mocked(getRoster).mockResolvedValue(roster([item("k1", "Davi Souza", "amendoim"), item("k2", "Bia Lima")]));
    render(<SessionDesk sessionId="s1" canOverride />);
    expect(await screen.findByText("Davi Souza")).toBeInTheDocument();
    expect(screen.getByText("Alergia: amendoim")).toBeInTheDocument();
    expect(screen.getAllByText("Alergia: amendoim")).toHaveLength(1);
    expect(screen.getByText("Presentes (2)")).toBeInTheDocument();
    expect(screen.getAllByText("Maria Souza")).toHaveLength(2);
    expect(screen.getByText("2 de 12")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\b[2-9A-HJKMNP-Z]{4}\b.*código/i);
  });

  it("sem ninguém presente é estado vazio com a orientação, não zero mudo", async () => {
    vi.mocked(getRoster).mockResolvedValue(roster([]));
    render(<SessionDesk sessionId="s1" canOverride />);
    expect(await screen.findByText("Nenhuma criança presente")).toBeInTheDocument();
    expect(screen.getByText("Presentes (0)")).toBeInTheDocument();
  });

  it("capacidade só avisa: âmbar com texto, e a lista segue", async () => {
    vi.mocked(getRoster).mockResolvedValue(roster([item("k1", "Davi"), item("k2", "Bia")], 2));
    render(<SessionDesk sessionId="s1" canOverride />);
    expect(await screen.findByText(/2 de 2 · na capacidade/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entregar criança: Davi" })).toBeEnabled();
  });

  it("sem capacidade definida não mostra o contador", async () => {
    vi.mocked(getRoster).mockResolvedValue(roster([item("k1", "Davi")], null));
    render(<SessionDesk sessionId="s1" canOverride />);
    await screen.findByText("Davi");
    expect(screen.queryByText(/ de \d+$/)).not.toBeInTheDocument();
  });

  it("falha de carga é erro com nova tentativa, nunca ‘nenhuma criança’", async () => {
    const user = userEvent.setup();
    vi.mocked(getRoster).mockRejectedValueOnce(httpError(500)).mockResolvedValueOnce(roster([item("k1", "Davi")]));
    render(<SessionDesk sessionId="s1" canOverride />);
    expect(await screen.findByText("Não foi possível carregar quem está presente.")).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma criança presente")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Tentar de novo/ }));
    expect(await screen.findByText("Davi")).toBeInTheDocument();
  });

  it("403 diz que falta acesso à turma", async () => {
    vi.mocked(getRoster).mockRejectedValue(httpError(403));
    render(<SessionDesk sessionId="s1" canOverride />);
    expect(await screen.findByText(/Você não tem acesso a esta turma/)).toBeInTheDocument();
  });

  it("busca e faz check-in; criança já presente aparece como Presente, sem botão", async () => {
    const user = userEvent.setup();
    vi.mocked(getRoster).mockResolvedValue(roster([item("k2", "Bia Lima")]));
    vi.mocked(searchChildren).mockResolvedValue([DAVI, { ...DAVI, id: "k2", full_name: "Bia Lima", birth_date: null }]);
    render(<SessionDesk sessionId="s1" canOverride />);
    await screen.findByText("Presentes (1)");

    await user.type(screen.getByPlaceholderText("Buscar criança pelo nome"), "d");
    expect(searchChildren).not.toHaveBeenCalled();
    await user.type(screen.getByPlaceholderText("Buscar criança pelo nome"), "a");
    const row = (await screen.findByRole("button", { name: "Fazer check-in: Davi Souza" })).closest("li")!;
    expect(row).toBeInTheDocument();
    expect(screen.getByText("Presente")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fazer check-in: Bia Lima" })).not.toBeInTheDocument();
    expect(screen.getByText("Sem data de nascimento")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Fazer check-in: Davi Souza" }));
    expect(screen.getByTestId("checkin")).toHaveTextContent("checkin:Davi Souza:Maternal");
    await user.click(screen.getByRole("button", { name: "feito" }));
    await waitFor(() => expect(getRoster).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole("button", { name: "fechar checkin" }));
    expect(screen.queryByTestId("checkin")).not.toBeInTheDocument();
  });

  it("busca sem resultado e busca com erro dizem o que houve", async () => {
    const user = userEvent.setup();
    vi.mocked(getRoster).mockResolvedValue(roster([]));
    vi.mocked(searchChildren).mockResolvedValueOnce([]).mockRejectedValueOnce(httpError(500));
    render(<SessionDesk sessionId="s1" canOverride />);
    await screen.findByText("Nenhuma criança presente");
    const input = screen.getByPlaceholderText("Buscar criança pelo nome");
    await user.type(input, "zé");
    expect(await screen.findByText(/Nenhuma criança com esse nome/)).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "zéa");
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível buscar crianças.");
  });

  it("entrega: abre o diálogo com o papel do líder, confirma ‘Criança entregue’ e recarrega", async () => {
    const user = userEvent.setup();
    vi.mocked(getRoster).mockResolvedValue(roster([item("k1", "Davi Souza")]));
    render(<SessionDesk sessionId="s1" canOverride={false} />);
    await user.click(await screen.findByRole("button", { name: "Entregar criança: Davi Souza" }));
    expect(screen.getByTestId("checkout")).toHaveTextContent("checkout:Davi Souza:false");

    await user.click(screen.getByRole("button", { name: "entregou" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Criança entregue: Davi Souza.");
    expect(screen.queryByTestId("checkout")).not.toBeInTheDocument();
    await waitFor(() => expect(getRoster).toHaveBeenCalledTimes(2));
  });

  it("fechar o diálogo de entrega não entrega", async () => {
    const user = userEvent.setup();
    vi.mocked(getRoster).mockResolvedValue(roster([item("k1", "Davi Souza")]));
    render(<SessionDesk sessionId="s1" canOverride />);
    await user.click(await screen.findByRole("button", { name: "Entregar criança: Davi Souza" }));
    await user.click(screen.getByRole("button", { name: "fechar checkout" }));
    expect(screen.queryByTestId("checkout")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Davi Souza")).toBeInTheDocument();
  });

  it("o campo de QR fica na mesa com o roster carregado e o check-in por QR recarrega os presentes", async () => {
    vi.mocked(getRoster).mockResolvedValue(roster([item("k1", "Davi Souza")]));
    const user = userEvent.setup();
    render(<SessionDesk sessionId="s1" canOverride />);
    expect(await screen.findByTestId("qrdesk")).toHaveTextContent("qrdesk:Maternal:1");
    expect(getRoster).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "qr check-in feito" }));
    await waitFor(() => expect(getRoster).toHaveBeenCalledTimes(2));
  });

  it("QR de check-out lido abre a entrega daquela criança já com o QR; o botão da linha abre sem QR", async () => {
    vi.mocked(getRoster).mockResolvedValue(roster([item("k1", "Davi Souza")]));
    const user = userEvent.setup();
    render(<SessionDesk sessionId="s1" canOverride />);
    await user.click(await screen.findByRole("button", { name: "qr check-out lido" }));
    expect(screen.getByTestId("checkout")).toHaveTextContent("checkout:Davi Souza:true:qr=kidsco1.qr");
    await user.click(screen.getByRole("button", { name: "fechar checkout" }));

    await user.click(screen.getByRole("button", { name: "Entregar criança: Davi Souza" }));
    expect(screen.getByTestId("checkout")).toHaveTextContent("qr=-");
  });

  it("as recusas do check-in sobrevivem a fechar e reabrir a entrega", async () => {
    vi.mocked(getRoster).mockResolvedValue(roster([item("k1", "Davi Souza"), item("k2", "Bia Lima")]));
    const user = userEvent.setup();
    render(<SessionDesk sessionId="s1" canOverride />);
    await user.click(await screen.findByRole("button", { name: "Entregar criança: Davi Souza" }));
    expect(screen.getByTestId("checkout")).toHaveTextContent("refusals=0");
    await user.click(screen.getByRole("button", { name: "recusou" }));
    await user.click(screen.getByRole("button", { name: "fechar checkout" }));

    await user.click(screen.getByRole("button", { name: "Entregar criança: Davi Souza" }));
    expect(screen.getByTestId("checkout")).toHaveTextContent("refusals=1");
    await user.click(screen.getByRole("button", { name: "fechar checkout" }));
    // Outra criança não herda a contagem.
    await user.click(screen.getByRole("button", { name: "Entregar criança: Bia Lima" }));
    expect(screen.getByTestId("checkout")).toHaveTextContent("refusals=0");
  });

  describe("respostas de uma consulta que já foi trocada", () => {
    const deferred = <T,>() => {
      let resolve!: (v: T) => void;
      let reject!: (e: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
    const outra = roster([item("k7", "Zeca Atual")]);

    it("roster da turma anterior que chega depois não sobrescreve a turma aberta", async () => {
      const antiga = deferred<KidsRoster>();
      vi.mocked(getRoster).mockReturnValueOnce(antiga.promise).mockResolvedValue(outra);
      const { rerender } = render(<SessionDesk sessionId="s1" canOverride />);
      rerender(<SessionDesk sessionId="s2" canOverride />);
      expect(await screen.findByText("Zeca Atual")).toBeInTheDocument();

      antiga.resolve(roster([item("k1", "Davi Souza")]));
      await waitFor(() => expect(screen.queryByText("Davi Souza")).not.toBeInTheDocument());
      expect(screen.getByText("Zeca Atual")).toBeInTheDocument();
    });

    it("falha tardia do roster anterior não vira erro nem acesso negado na turma aberta", async () => {
      const antiga = deferred<KidsRoster>();
      vi.mocked(getRoster).mockReturnValueOnce(antiga.promise).mockResolvedValue(outra);
      const { rerender } = render(<SessionDesk sessionId="s1" canOverride />);
      rerender(<SessionDesk sessionId="s2" canOverride />);
      expect(await screen.findByText("Zeca Atual")).toBeInTheDocument();

      antiga.reject(httpError(403));
      await waitFor(() => expect(getRoster).toHaveBeenCalledTimes(2));
      expect(screen.getByText("Zeca Atual")).toBeInTheDocument();
      expect(screen.queryByText(/sem acesso|Sem acesso/)).not.toBeInTheDocument();
    });

    it("resultado de uma busca antiga não aparece sobre a busca atual, nem o erro dela", async () => {
      const user = userEvent.setup();
      const antiga = deferred<(typeof DAVI)[]>();
      const antigaErro = deferred<(typeof DAVI)[]>();
      vi.mocked(getRoster).mockResolvedValue(roster([]));
      vi.mocked(searchChildren)
        .mockReturnValueOnce(antiga.promise)
        .mockReturnValueOnce(antigaErro.promise)
        .mockResolvedValue([{ ...DAVI, id: "k9", full_name: "Zeca Atual" }]);
      render(<SessionDesk sessionId="s1" canOverride />);
      await screen.findByText("Nenhuma criança presente");
      const input = screen.getByPlaceholderText("Buscar criança pelo nome");
      await user.type(input, "da");
      await waitFor(() => expect(searchChildren).toHaveBeenCalledTimes(1));
      await user.type(input, "v");
      await waitFor(() => expect(searchChildren).toHaveBeenCalledTimes(2));
      await user.type(input, "i");
      expect(await screen.findByText("Zeca Atual")).toBeInTheDocument();

      antiga.resolve([DAVI]);
      antigaErro.reject(httpError(500));
      await waitFor(() => expect(searchChildren).toHaveBeenCalledTimes(3));
      expect(screen.queryByText("Davi Souza")).not.toBeInTheDocument();
      expect(screen.queryByText("Não foi possível buscar crianças.")).not.toBeInTheDocument();
      expect(screen.getByText("Zeca Atual")).toBeInTheDocument();
    });
  });

  it("criança sem data de nascimento aparece com travessão, e turma sem capacidade nunca é lotada", async () => {
    const semNascimento = item("k3", "Bia Lima");
    semNascimento.child.birth_date = null;
    vi.mocked(getRoster).mockResolvedValue(roster([semNascimento], null));
    render(<SessionDesk sessionId="s1" canOverride />);
    expect(await screen.findByText("Bia Lima")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/lotada/i)).not.toBeInTheDocument();
  });
});
