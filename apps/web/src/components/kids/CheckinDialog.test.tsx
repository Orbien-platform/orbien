import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkIn, getChild, type KidsChild, type KidsCheckinResult, type KidsFicha } from "@/lib/kids";
import { CheckinDialog } from "./CheckinDialog";

vi.mock("@/lib/kids", async (orig) => ({
  ...(await orig<typeof import("@/lib/kids")>()),
  checkIn: vi.fn(),
  getChild: vi.fn(),
}));
vi.mock("@/components/kids/PrintLabels", () => ({
  PrintLabels: ({ labels, onDone }: { labels: { checkin_id: string }; onDone: () => void }) => (
    <div data-testid="print">
      imprimindo:{labels.checkin_id}
      <button onClick={onDone}>terminou</button>
    </div>
  ),
}));

const CHILD: KidsChild = { id: "k1", full_name: "Davi Souza", birth_date: "2022-03-10T00:00:00.000Z", household_id: "h1" };
const guardian = (id: string, name: string, primary: boolean) => ({
  id: `g-${id}`,
  guardian_person_id: id,
  full_name: name,
  phone: null,
  photo_url: null,
  relationship: primary ? "mãe" : "avó",
  can_pickup: true,
  is_primary: primary,
});
const FICHA: KidsFicha = {
  ...CHILD,
  allergies: "amendoim",
  medical_notes: null,
  guardians: [guardian("p2", "Lúcia Souza", false), guardian("p1", "Maria Souza", true)],
};
const RESULT: KidsCheckinResult = {
  id: "c1",
  session_id: "s1",
  child_id: "k1",
  guardian_person_id: "p1",
  code: "A2B3",
  checked_in_at: "2026-10-25T13:00:00.000Z",
  age_override: false,
  capacity_warning: null,
  labels: {
    checkin_id: "c1",
    child_label: { child_name: "Davi Souza", room_name: "Maternal", has_allergy: true, allergy: "amendoim", code: "A2B3" },
    guardian_label: { child_name: "Davi Souza", room_name: "Maternal", code: "A2B3" },
  },
};

const apiError = (status: number, data: Record<string, unknown>) =>
  Object.assign(new Error("x"), { isAxiosError: true, response: { status, data } });

function setup() {
  const onClose = vi.fn();
  const onCheckedIn = vi.fn();
  render(<CheckinDialog sessionId="s1" roomName="Maternal" child={CHILD} onClose={onClose} onCheckedIn={onCheckedIn} />);
  return { onClose, onCheckedIn };
}

describe("CheckinDialog", () => {
  beforeEach(() => {
    vi.mocked(checkIn).mockReset();
    vi.mocked(getChild).mockReset();
    vi.mocked(getChild).mockResolvedValue(FICHA);
  });

  it("mostra a alergia, pré-seleciona o responsável primário e confirma com o código grande", async () => {
    const user = userEvent.setup();
    const { onCheckedIn, onClose } = setup();
    vi.mocked(checkIn).mockResolvedValue(RESULT);

    expect(await screen.findByText("Alergia: amendoim")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Maria Souza/ })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Fazer check-in" }));

    await waitFor(() => expect(checkIn).toHaveBeenCalledWith("s1", { child_id: "k1", guardian_person_id: "p1" }));
    expect(onCheckedIn).toHaveBeenCalled();
    expect(await screen.findByRole("dialog", { name: /Check-in feito/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Código de retirada: A, 2, B, 3" })).toBeInTheDocument();
    expect(screen.getByText(/a equipe não consegue relê-lo/)).toBeInTheDocument();
    expect(screen.getByText("Alergia: amendoim")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Concluir" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("troca quem entrega", async () => {
    const user = userEvent.setup();
    setup();
    vi.mocked(checkIn).mockResolvedValue(RESULT);
    await user.click(await screen.findByRole("radio", { name: /Lúcia Souza/ }));
    await user.click(screen.getByRole("button", { name: "Fazer check-in" }));
    await waitFor(() => expect(checkIn).toHaveBeenCalledWith("s1", { child_id: "k1", guardian_person_id: "p2" }));
  });

  it("imprimir etiqueta é secundário e usa as etiquetas da resposta do check-in", async () => {
    const user = userEvent.setup();
    setup();
    vi.mocked(checkIn).mockResolvedValue(RESULT);
    await user.click(await screen.findByRole("button", { name: "Fazer check-in" }));
    await user.click(await screen.findByRole("button", { name: "Imprimir etiqueta" }));
    expect(screen.getByTestId("print")).toHaveTextContent("imprimindo:c1");
    await user.click(screen.getByRole("button", { name: "terminou", hidden: true }));
    expect(screen.queryByTestId("print")).not.toBeInTheDocument();
  });

  it("turma na capacidade só avisa e deixa seguir; fora da faixa confirmado é dito", async () => {
    const user = userEvent.setup();
    setup();
    vi.mocked(checkIn).mockResolvedValue({ ...RESULT, age_override: true, capacity_warning: { capacity: 12, present: 12 } });
    await user.click(await screen.findByRole("button", { name: "Fazer check-in" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Turma na capacidade: 12 de 12. Pode seguir.");
    expect(screen.getByText(/fora da faixa da turma, confirmada pela equipe/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Código de retirada/ })).toBeInTheDocument();
  });

  it("fora da faixa em turma que aceita pede confirmação e reenvia com confirm_out_of_range", async () => {
    const user = userEvent.setup();
    setup();
    vi.mocked(checkIn)
      .mockRejectedValueOnce(
        apiError(422, {
          code: "OUT_OF_RANGE_CONFIRM",
          message: "Criança fora da faixa etária da turma. Confirme para seguir",
          age_months: 40,
          min_age_months: 48,
          max_age_months: 71,
          room_name: "Júnior",
        }),
      )
      .mockResolvedValueOnce({ ...RESULT, age_override: true });
    await user.click(await screen.findByRole("button", { name: "Fazer check-in" }));

    expect(await screen.findByText("Criança fora da faixa etária")).toBeInTheDocument();
    expect(screen.getByText(/tem 3 anos e 4 meses e a turma Maternal é de 4 a 5 anos/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Fazer check-in mesmo assim" }));
    await waitFor(() =>
      expect(checkIn).toHaveBeenLastCalledWith("s1", { child_id: "k1", guardian_person_id: "p1", confirm_out_of_range: true }),
    );
    expect(await screen.findByRole("img", { name: /Código de retirada/ })).toBeInTheDocument();
  });

  it("Voltar na confirmação de faixa retorna à escolha do responsável sem gravar", async () => {
    const user = userEvent.setup();
    setup();
    vi.mocked(checkIn).mockRejectedValueOnce(
      apiError(422, { code: "OUT_OF_RANGE_CONFIRM", age_months: 40, min_age_months: 48, max_age_months: 71 }),
    );
    await user.click(await screen.findByRole("button", { name: "Fazer check-in" }));
    await user.click(await screen.findByRole("button", { name: "Voltar" }));
    expect(screen.getByText("Quem está entregando a criança")).toBeInTheDocument();
    expect(checkIn).toHaveBeenCalledTimes(1);
  });

  it("fora da faixa em turma que não aceita é recusa sem confirmação possível", async () => {
    const user = userEvent.setup();
    setup();
    vi.mocked(checkIn).mockRejectedValue(
      apiError(422, { code: "kids_out_of_range", message: "Criança fora da faixa etária da turma", age_months: 40 }),
    );
    await user.click(await screen.findByRole("button", { name: "Fazer check-in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Criança fora da faixa etária da turma");
    expect(screen.queryByRole("button", { name: "Fazer check-in mesmo assim" })).not.toBeInTheDocument();
  });

  it("criança já presente (409), consentimento pendente e erro genérico têm mensagem própria", async () => {
    const user = userEvent.setup();
    setup();
    vi.mocked(checkIn)
      .mockRejectedValueOnce(apiError(409, { message: "Esta criança já está presente" }))
      .mockRejectedValueOnce(apiError(422, { code: "kids_consent_required", message: "É preciso o consentimento vigente do responsável para o check-in" }))
      .mockRejectedValueOnce(apiError(500, {}));
    const go = await screen.findByRole("button", { name: "Fazer check-in" });
    await user.click(go);
    expect(await screen.findByRole("alert")).toHaveTextContent("Esta criança já está presente");
    await user.click(go);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Registre-o na ficha da criança"));
    await user.click(go);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível fazer o check-in"));
  });

  it("criança sem responsável cadastrado não deixa fazer o check-in", async () => {
    vi.mocked(getChild).mockResolvedValue({ ...FICHA, allergies: null, guardians: [] });
    setup();
    expect(await screen.findByText(/não tem responsável cadastrado/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fazer check-in" })).toBeDisabled();
  });

  it("falha ao carregar os responsáveis é erro com nova tentativa", async () => {
    const user = userEvent.setup();
    vi.mocked(getChild).mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce(FICHA);
    const { onClose } = setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar os responsáveis");
    await user.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByRole("radio", { name: /Maria Souza/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(onClose).toHaveBeenCalled();
  });
});
