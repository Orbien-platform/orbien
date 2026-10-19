import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockSaveAttendance = jest.fn();
jest.mock("../../lib/escala/escala-client", () => ({
  saveAttendance: (...args: unknown[]) => mockSaveAttendance(...args),
}));

import { HttpError, NetworkError } from "../../lib/api/errors";
import { AttendanceCountPanel } from "./AttendanceCountPanel";

const SAVED = { children: 10, members: 50, attendees: 8, visitors: 4, total: 72 };

async function setup(attendance: typeof SAVED | null = null) {
  const onSaved = jest.fn();
  await render(
    <AttendanceCountPanel instanceId="i1" idPrefix="x" attendance={attendance} onSaved={onSaved} />,
  );
  return { onSaved };
}

async function fill(values: [string, string, string, string]) {
  await fireEvent.changeText(screen.getByTestId("x-attendance-children"), values[0]);
  await fireEvent.changeText(screen.getByTestId("x-attendance-members"), values[1]);
  await fireEvent.changeText(screen.getByTestId("x-attendance-attendees"), values[2]);
  await fireEvent.changeText(screen.getByTestId("x-attendance-visitors"), values[3]);
}

describe("AttendanceCountPanel", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fechado, convida a contar; com contagem, mostra o total lançado", async () => {
    await setup();
    expect(screen.getByText("Contar público")).toBeTruthy();
  });

  it("com contagem lançada, o botão mostra o total e o formulário abre preenchido", async () => {
    await setup(SAVED);
    expect(screen.getByText("Contagem lançada: 72")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("x-attendance-open"));

    expect(screen.getByTestId("x-attendance-members").props.value).toBe("50");
    expect(screen.getByTestId("x-attendance-total").props.children).toBe(72);
  });

  it("soma o total ao vivo e só habilita salvar com as quatro categorias válidas", async () => {
    await setup();
    await fireEvent.press(screen.getByTestId("x-attendance-open"));

    await fill(["1", "2", "3", ""]);
    expect(screen.getByTestId("x-attendance-total").props.children).toBe(6);
    await fireEvent.press(screen.getByTestId("x-attendance-save"));
    expect(mockSaveAttendance).not.toHaveBeenCalled();

    await fill(["1", "2", "3", "4"]);
    expect(screen.getByTestId("x-attendance-total").props.children).toBe(10);

    // Fracionado, negativo e acima do limite não valem; zero vale.
    await fill(["1,5", "2", "3", "4"]);
    await fireEvent.press(screen.getByTestId("x-attendance-save"));
    await fill(["1", "-2", "3", "4"]);
    await fireEvent.press(screen.getByTestId("x-attendance-save"));
    await fill(["1", "2", "100001", "4"]);
    await fireEvent.press(screen.getByTestId("x-attendance-save"));
    expect(mockSaveAttendance).not.toHaveBeenCalled();
  });

  it("salva, avisa a tela e fecha o formulário", async () => {
    mockSaveAttendance.mockResolvedValue(SAVED);
    const { onSaved } = await setup();
    await fireEvent.press(screen.getByTestId("x-attendance-open"));
    await fill(["10", "50", "8", "4"]);

    await act(async () => {
      fireEvent.press(screen.getByTestId("x-attendance-save"));
    });

    expect(mockSaveAttendance).toHaveBeenCalledWith("i1", {
      children: 10,
      members: 50,
      attendees: 8,
      visitors: 4,
    });
    expect(onSaved).toHaveBeenCalledWith(SAVED);
    expect(screen.queryByTestId("x-attendance-form")).toBeNull();
  });

  it("zero é contagem válida", async () => {
    mockSaveAttendance.mockResolvedValue({ ...SAVED, children: 0, members: 0, attendees: 0, visitors: 0, total: 0 });
    await setup();
    await fireEvent.press(screen.getByTestId("x-attendance-open"));
    await fill(["0", "0", "0", "0"]);
    await act(async () => {
      fireEvent.press(screen.getByTestId("x-attendance-save"));
    });
    expect(mockSaveAttendance).toHaveBeenCalledTimes(1);
  });

  it("mostra a mensagem da API quando ela recusa (4xx), por exemplo antes do dia do culto", async () => {
    mockSaveAttendance.mockRejectedValue(
      new HttpError(422, { message: "A contagem só pode ser lançada a partir do dia do culto" }),
    );
    const { onSaved } = await setup();
    await fireEvent.press(screen.getByTestId("x-attendance-open"));
    await fill(["1", "1", "1", "1"]);

    await act(async () => {
      fireEvent.press(screen.getByTestId("x-attendance-save"));
    });

    expect(screen.getByTestId("x-attendance-error").props.children).toBe(
      "A contagem só pode ser lançada a partir do dia do culto",
    );
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByTestId("x-attendance-form")).toBeTruthy();
  });

  it("erro de servidor ou de rede cai na mensagem padrão", async () => {
    mockSaveAttendance.mockRejectedValueOnce(new HttpError(500, { message: "Internal server error" }));
    await setup();
    await fireEvent.press(screen.getByTestId("x-attendance-open"));
    await fill(["1", "1", "1", "1"]);
    await act(async () => {
      fireEvent.press(screen.getByTestId("x-attendance-save"));
    });
    expect(screen.getByTestId("x-attendance-error").props.children).toBe(
      "Não foi possível salvar a contagem. Tente novamente.",
    );

    mockSaveAttendance.mockRejectedValueOnce(new NetworkError());
    await act(async () => {
      fireEvent.press(screen.getByTestId("x-attendance-save"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("x-attendance-error").props.children).toBe(
        "Não foi possível salvar a contagem. Tente novamente.",
      ),
    );
  });

  it("não dispara um segundo salvamento enquanto o primeiro não termina", async () => {
    let resolve!: (v: unknown) => void;
    mockSaveAttendance.mockReturnValue(new Promise((r) => (resolve = r)));
    await setup();
    await fireEvent.press(screen.getByTestId("x-attendance-open"));
    await fill(["1", "1", "1", "1"]);

    await act(async () => {
      fireEvent.press(screen.getByTestId("x-attendance-save"));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("x-attendance-save"));
    });
    expect(mockSaveAttendance).toHaveBeenCalledTimes(1);
    await act(async () => resolve(SAVED));
  });

  it("Voltar fecha o formulário sem salvar", async () => {
    await setup();
    await fireEvent.press(screen.getByTestId("x-attendance-open"));
    await fireEvent.press(screen.getByTestId("x-attendance-cancel"));
    expect(screen.queryByTestId("x-attendance-form")).toBeNull();
    expect(mockSaveAttendance).not.toHaveBeenCalled();
  });
});
