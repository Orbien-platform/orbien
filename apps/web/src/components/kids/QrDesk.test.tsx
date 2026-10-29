import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkInByQr, type KidsCheckinResult, type KidsRosterItem } from "@/lib/kids";
import { QrDesk } from "./QrDesk";

vi.mock("@/lib/kids", async (orig) => ({
  ...(await orig<typeof import("@/lib/kids")>()),
  checkInByQr: vi.fn(),
}));
vi.mock("@/components/kids/PrintLabels", () => ({ PrintLabels: () => null }));

const ID = "0b9f3c1e-4d2a-4f6b-8c1d-2a3b4c5d6e7f";
const CHECKIN_QR = `kidsci1.${ID}.${"A".repeat(43)}`;
const CHECKOUT_QR = `kidsco1.c-k1.A2B3.sig`;
const CHECKOUT_QR_OK = `kidsco1.${ID}.A2B3.sig`;

const RESULT: KidsCheckinResult = {
  id: "c1",
  session_id: "s1",
  child_id: "k1",
  guardian_person_id: "p1",
  code: "Q7R8",
  checked_in_at: "2026-10-25T13:00:00.000Z",
  age_override: false,
  capacity_warning: null,
  labels: {
    checkin_id: "c1",
    child_label: { child_name: "Davi Souza", room_name: "Maternal", has_allergy: false, allergy: null, code: "Q7R8" },
    guardian_label: { child_name: "Davi Souza", room_name: "Maternal", code: "Q7R8" },
  },
};
const ITEM: KidsRosterItem = {
  checkin_id: ID,
  checked_in_at: "2026-10-25T13:00:00.000Z",
  age_override: false,
  child: { id: "k2", full_name: "Bia Lima", birth_date: null },
  guardian: { person_id: "p9", full_name: "Rui Lima" },
  has_allergy: false,
  allergies: null,
};
const apiError = (status: number, data: Record<string, unknown>) =>
  Object.assign(new Error("x"), { isAxiosError: true, response: { status, data } });

function setup(items: KidsRosterItem[] = [ITEM]) {
  const onCheckedIn = vi.fn();
  const onCheckout = vi.fn();
  render(<QrDesk sessionId="s1" roomName="Maternal" items={items} onCheckedIn={onCheckedIn} onCheckout={onCheckout} />);
  return { onCheckedIn, onCheckout };
}
beforeEach(() => vi.mocked(checkInByQr).mockReset());

async function scan(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(screen.getByLabelText("Ler QR"), `${text}{Enter}`);
}

describe("QrDesk — check-in por QR", () => {
  it("lê o QR de check-in, faz o check-in na sessão e mostra o código grande", async () => {
    vi.mocked(checkInByQr).mockResolvedValue(RESULT);
    const user = userEvent.setup();
    const { onCheckedIn } = setup();
    await scan(user, CHECKIN_QR);
    expect(checkInByQr).toHaveBeenCalledWith("s1", { qr: CHECKIN_QR });
    expect(await screen.findByRole("dialog", { name: /Check-in feito/ })).toHaveTextContent("Davi Souza · Maternal");
    expect(screen.getByRole("img", { name: "Código de retirada: Q, 7, R, 8" })).toBeInTheDocument();
    expect(onCheckedIn).toHaveBeenCalledTimes(1);
  });

  it("‘Concluir’ fecha a confirmação e libera o campo para o próximo QR", async () => {
    vi.mocked(checkInByQr).mockResolvedValue(RESULT);
    const user = userEvent.setup();
    setup();
    await scan(user, CHECKIN_QR);
    await user.click(await screen.findByRole("button", { name: "Concluir" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("QR recusado (403 genérico): mostra a mensagem do servidor e nenhuma confirmação", async () => {
    vi.mocked(checkInByQr).mockRejectedValueOnce(
      apiError(403, { message: "Não foi possível validar o QR. Peça um novo ao responsável." }),
    );
    const user = userEvent.setup();
    const { onCheckedIn } = setup();
    await scan(user, CHECKIN_QR);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível validar o QR. Peça um novo ao responsável.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onCheckedIn).not.toHaveBeenCalled();
  });

  it("falha de rede cai na mesma orientação: pedir um novo QR", async () => {
    vi.mocked(checkInByQr).mockRejectedValueOnce(new Error("rede"));
    const user = userEvent.setup();
    setup();
    await scan(user, CHECKIN_QR);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível fazer o check-in. Tente de novo.");
  });

  it("fora da faixa em turma que aceita: pede a confirmação e reenvia o MESMO QR com confirm_out_of_range", async () => {
    vi.mocked(checkInByQr)
      .mockRejectedValueOnce(
        apiError(422, { code: "OUT_OF_RANGE_CONFIRM", age_months: 40, min_age_months: 12, max_age_months: 36 }),
      )
      .mockResolvedValueOnce({ ...RESULT, age_override: true });
    const user = userEvent.setup();
    setup();
    await scan(user, CHECKIN_QR);
    const ask = await screen.findByRole("dialog", { name: /fora da faixa etária/i });
    expect(ask).toHaveTextContent("Maternal");
    await user.click(screen.getByRole("button", { name: "Fazer check-in mesmo assim" }));
    await waitFor(() =>
      expect(checkInByQr).toHaveBeenLastCalledWith("s1", { qr: CHECKIN_QR, confirm_out_of_range: true }),
    );
    expect(await screen.findByRole("dialog", { name: /Check-in feito/ })).toHaveTextContent(
      "Criança fora da faixa da turma, confirmada pela equipe.",
    );
  });

  it("‘Voltar’ na confirmação de faixa não faz check-in", async () => {
    vi.mocked(checkInByQr).mockRejectedValueOnce(
      apiError(422, { code: "OUT_OF_RANGE_CONFIRM", age_months: 40, min_age_months: 12, max_age_months: 36 }),
    );
    const user = userEvent.setup();
    setup();
    await scan(user, CHECKIN_QR);
    await user.click(await screen.findByRole("button", { name: "Voltar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(checkInByQr).toHaveBeenCalledTimes(1);
  });

  it("Esc na confirmação de faixa a fecha sem fazer o check-in", async () => {
    vi.mocked(checkInByQr).mockRejectedValueOnce(
      apiError(422, { code: "OUT_OF_RANGE_CONFIRM", age_months: 40, min_age_months: 12, max_age_months: 36 }),
    );
    const user = userEvent.setup();
    setup();
    await scan(user, CHECKIN_QR);
    await screen.findByRole("dialog", { name: /fora da faixa etária/i });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(checkInByQr).toHaveBeenCalledTimes(1);
  });

  it("erro ao confirmar a faixa aparece dentro da confirmação, que segue aberta", async () => {
    vi.mocked(checkInByQr)
      .mockRejectedValueOnce(
        apiError(422, { code: "OUT_OF_RANGE_CONFIRM", age_months: 40, min_age_months: 12, max_age_months: 36 }),
      )
      .mockRejectedValueOnce(apiError(409, { message: "x" }));
    const user = userEvent.setup();
    setup();
    await scan(user, CHECKIN_QR);
    await user.click(await screen.findByRole("button", { name: "Fazer check-in mesmo assim" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Esta criança já está presente");
    expect(screen.getByRole("dialog", { name: /fora da faixa etária/i })).toBeInTheDocument();
  });

  it.each([
    [422, { code: "kids_out_of_range" }, "Criança fora da faixa etária da turma"],
    [409, { message: "ocupado" }, "Esta criança já está presente"],
    [422, { code: "kids_consent_required", message: "Falta o consentimento" }, "Falta o consentimento. Registre-o na ficha da criança."],
  ])("regra do check-in normal vale também por QR (%s %j)", async (status, data, expected) => {
    vi.mocked(checkInByQr).mockRejectedValueOnce(apiError(status, data));
    const user = userEvent.setup();
    setup();
    await scan(user, CHECKIN_QR);
    expect(await screen.findByRole("alert")).toHaveTextContent(expected);
  });
});

describe("QrDesk — leitura do QR de check-out", () => {
  it("localiza o check-in pelo id embutido e entrega o item e o QR à mesa", async () => {
    const user = userEvent.setup();
    const { onCheckout } = setup();
    await scan(user, CHECKOUT_QR_OK);
    expect(onCheckout).toHaveBeenCalledWith(ITEM, CHECKOUT_QR_OK);
    expect(checkInByQr).not.toHaveBeenCalled();
  });

  it("QR de check-out de quem não está nesta turma não abre nada", async () => {
    const user = userEvent.setup();
    const { onCheckout } = setup([]);
    await scan(user, CHECKOUT_QR_OK);
    expect(onCheckout).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent("Esta criança não está presente nesta turma.");
  });
});

describe("QrDesk — texto que não é QR do Kids", () => {
  it("avisa e não chama a API", async () => {
    const user = userEvent.setup();
    const { onCheckout } = setup();
    await scan(user, CHECKOUT_QR);
    expect(await screen.findByRole("alert")).toHaveTextContent("Este não é um QR do Kids");
    expect(checkInByQr).not.toHaveBeenCalled();
    expect(onCheckout).not.toHaveBeenCalled();
  });

  it("a mensagem some na leitura seguinte", async () => {
    vi.mocked(checkInByQr).mockResolvedValue(RESULT);
    const user = userEvent.setup();
    setup();
    await scan(user, "lixo");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await scan(user, CHECKIN_QR);
    await screen.findByRole("dialog", { name: /Check-in feito/ });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
