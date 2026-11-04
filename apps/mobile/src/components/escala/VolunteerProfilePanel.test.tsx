import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockGetMyVolunteerProfile = jest.fn();
const mockUpdateMyAvailability = jest.fn();
const mockAcceptVolunteerTerm = jest.fn();
jest.mock("../../lib/escala/escala-client", () => ({
  getMyVolunteerProfile: (...args: unknown[]) => mockGetMyVolunteerProfile(...args),
  updateMyAvailability: (...args: unknown[]) => mockUpdateMyAvailability(...args),
  acceptVolunteerTerm: (...args: unknown[]) => mockAcceptVolunteerTerm(...args),
}));

import { HttpError, NetworkError } from "../../lib/api/errors";
import NetInfo from "@react-native-community/netinfo";
import { VolunteerProfilePanel } from "./VolunteerProfilePanel";

const PROFILE = {
  id: "vp1",
  ministries: [
    { id: "m1", name: "Mídia", role: "leader" },
    { id: "m2", name: "Recepção", role: "volunteer" },
  ],
  skills: ["ProPresenter", "OBS"],
  availability: { sunday: ["morning", "evening"], wednesday: ["evening"] },
  restrictions: "Não pode carregar peso",
  volunteer_since: "2024-03-02T12:00:00.000Z",
  served_count: 96,
  term: { version: "volunteer_term_v1", text: "Texto do termo.", accepted_at: null as string | null },
};

describe("VolunteerProfilePanel", () => {
  beforeEach(() => jest.clearAllMocks());

  it("mostra ministérios, habilidades, disponibilidade, restrições e histórico", async () => {
    mockGetMyVolunteerProfile.mockResolvedValue(PROFILE);
    await render(<VolunteerProfilePanel />);

    expect(await screen.findByText("Mídia (líder) e Recepção")).toBeTruthy();
    expect(screen.getByText("ProPresenter e OBS")).toBeTruthy();
    expect(screen.getByTestId("disp-sunday-morning").props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId("disp-sunday-afternoon").props.accessibilityState.checked).toBe(false);
    expect(screen.getByTestId("disp-wednesday-evening").props.accessibilityState.checked).toBe(true);
    expect(screen.getByText("Não pode carregar peso")).toBeTruthy();
    expect(screen.getByText("96 escalas servidas, desde março 2024")).toBeTruthy();
    expect(screen.getByText("Ministérios, habilidades e restrições são cadastrados pela secretaria da igreja.")).toBeTruthy();
  });

  it("perfil recém-criado: os vazios dizem o que falta, e uma escala no singular", async () => {
    mockGetMyVolunteerProfile.mockResolvedValue({
      ...PROFILE,
      ministries: [],
      skills: [],
      availability: {},
      restrictions: null,
      served_count: 1,
    });
    await render(<VolunteerProfilePanel />);

    expect(await screen.findByText("Nenhum ainda")).toBeTruthy();
    expect(screen.getByText("Nenhuma informada")).toBeTruthy();
    expect(screen.queryByTestId("perfil-restricoes")).toBeNull();
    expect(screen.getByText(/^1 escala servida,/)).toBeTruthy();
  });

  it("não oferece edição de habilidade", async () => {
    mockGetMyVolunteerProfile.mockResolvedValue(PROFILE);
    await render(<VolunteerProfilePanel />);
    await screen.findByTestId("perfil-voluntario");
    expect(screen.getByTestId("perfil-habilidades").props.accessibilityRole).toBeUndefined();
    expect(screen.queryByTestId("perfil-habilidades-editar")).toBeNull();
  });

  describe("disponibilidade editável", () => {
    it("salvar fica desligado até mudar; salva só a disponibilidade e confirma", async () => {
      mockGetMyVolunteerProfile.mockResolvedValue(PROFILE);
      mockUpdateMyAvailability.mockResolvedValue({
        ...PROFILE,
        availability: { sunday: ["morning", "evening", "afternoon"], wednesday: ["evening"] },
      });
      await render(<VolunteerProfilePanel />);
      await screen.findByTestId("perfil-voluntario");

      const save = () => screen.getByTestId("disponibilidade-salvar");
      expect(save().props.accessibilityState?.disabled).toBe(true);

      await act(async () => {
        fireEvent.press(screen.getByTestId("disp-sunday-afternoon"));
      });
      expect(save().props.accessibilityState?.disabled).toBeFalsy();
      await act(async () => {
        fireEvent.press(save());
      });

      expect(mockUpdateMyAvailability).toHaveBeenCalledWith({
        sunday: ["morning", "afternoon", "evening"],
        monday: [],
        tuesday: [],
        wednesday: ["evening"],
        thursday: [],
        friday: [],
        saturday: [],
      });
      expect(await screen.findByText("Disponibilidade salva.")).toBeTruthy();
      expect(save().props.accessibilityState?.disabled).toBe(true);
    });

    it("desmarcar um turno e voltar ao original desliga o salvar de novo", async () => {
      mockGetMyVolunteerProfile.mockResolvedValue(PROFILE);
      await render(<VolunteerProfilePanel />);
      await screen.findByTestId("perfil-voluntario");
      await act(async () => {
        fireEvent.press(screen.getByTestId("disp-wednesday-evening"));
      });
      expect(screen.getByTestId("disp-wednesday-evening").props.accessibilityState.checked).toBe(false);
      await act(async () => {
        fireEvent.press(screen.getByTestId("disp-wednesday-evening"));
      });
      expect(screen.getByTestId("disponibilidade-salvar").props.accessibilityState?.disabled).toBe(true);
    });

    it.each([
      ["sem conexão", new NetworkError(), /Sem conexão/],
      ["erro de servidor", new HttpError(500, {}), /Não foi possível salvar/],
    ])("falha ao salvar (%s) avisa e mantém o rascunho", async (_n, error, text) => {
      mockGetMyVolunteerProfile.mockResolvedValue(PROFILE);
      mockUpdateMyAvailability.mockRejectedValue(error);
      await render(<VolunteerProfilePanel />);
      await screen.findByTestId("perfil-voluntario");
      await act(async () => {
        fireEvent.press(screen.getByTestId("disp-monday-morning"));
      });
      await act(async () => {
        fireEvent.press(screen.getByTestId("disponibilidade-salvar"));
      });
      expect(await screen.findByText(text)).toBeTruthy();
      expect(screen.getByTestId("disp-monday-morning").props.accessibilityState.checked).toBe(true);
    });
  });

  describe("termo de voluntariado", () => {
    it("ainda não aceito: mostra o texto e a versão, e aceita a versão exibida", async () => {
      mockGetMyVolunteerProfile.mockResolvedValue(PROFILE);
      mockAcceptVolunteerTerm.mockResolvedValue({
        ...PROFILE,
        term: { ...PROFILE.term, accepted_at: "2026-11-04T15:00:00.000Z" },
      });
      await render(<VolunteerProfilePanel />);

      expect(await screen.findByText("Texto do termo.")).toBeTruthy();
      expect(screen.getByText("Versão volunteer_term_v1")).toBeTruthy();
      expect(screen.queryByTestId("perfil-termo-aceito")).toBeNull();
      await act(async () => {
        fireEvent.press(screen.getByTestId("perfil-termo-aceitar"));
      });

      expect(mockAcceptVolunteerTerm).toHaveBeenCalledWith("volunteer_term_v1");
      expect(await screen.findByText("Aceito em 4 de novembro de 2026")).toBeTruthy();
      expect(screen.queryByTestId("perfil-termo-aceitar")).toBeNull();
    });

    it("já aceito: mostra a data e não oferece aceitar", async () => {
      mockGetMyVolunteerProfile.mockResolvedValue({
        ...PROFILE,
        term: { ...PROFILE.term, accepted_at: "2026-10-01T12:00:00.000Z" },
      });
      await render(<VolunteerProfilePanel />);
      expect(await screen.findByText("Aceito em 1 de outubro de 2026")).toBeTruthy();
      expect(screen.queryByTestId("perfil-termo-aceitar")).toBeNull();
    });

    it("data ilegível não quebra a tela", async () => {
      mockGetMyVolunteerProfile.mockResolvedValue({ ...PROFILE, term: { ...PROFILE.term, accepted_at: "ontem" } });
      await render(<VolunteerProfilePanel />);
      expect(await screen.findByText("Aceito em data não informada")).toBeTruthy();
    });

    it("termo atualizado no servidor (409): mostra a mensagem da API", async () => {
      mockAcceptVolunteerTerm.mockRejectedValue(
        new HttpError(409, { code: "volunteer_term_outdated", message: "O termo foi atualizado; leia a versão vigente antes de aceitar" }),
      );
      mockGetMyVolunteerProfile.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce({
        ...PROFILE,
        term: { ...PROFILE.term, version: "volunteer_term_v2", text: "Texto novo." },
      });
      await render(<VolunteerProfilePanel />);
      await screen.findByTestId("perfil-voluntario");
      await act(async () => {
        fireEvent.press(screen.getByTestId("perfil-termo-aceitar"));
      });
      expect(await screen.findByText(/O termo foi atualizado/)).toBeTruthy();
      expect(await screen.findByText("Texto novo.")).toBeTruthy();
    });
  });

  it("ninguém serviu ainda", async () => {
    mockGetMyVolunteerProfile.mockResolvedValue({ ...PROFILE, served_count: 0 });
    await render(<VolunteerProfilePanel />);
    expect(await screen.findByText(/^Nenhuma escala servida ainda,/)).toBeTruthy();
  });

  it("sem perfil de voluntário (404): diz a quem pedir, sem botão de tentar de novo", async () => {
    mockGetMyVolunteerProfile.mockRejectedValue(new HttpError(404, "não encontrado"));
    await render(<VolunteerProfilePanel />);

    expect(await screen.findByText("Você ainda não tem perfil de voluntário")).toBeTruthy();
    expect(screen.queryByTestId("perfil-voluntario-tentar")).toBeNull();
  });

  it("falha de servidor: mostra o erro e tenta de novo", async () => {
    mockGetMyVolunteerProfile.mockRejectedValueOnce(new HttpError(500, "erro")).mockResolvedValueOnce(PROFILE);
    await render(<VolunteerProfilePanel />);

    expect(await screen.findByText("Não foi possível carregar seu perfil de voluntário.")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId("perfil-voluntario-tentar"));
    });

    expect(await screen.findByTestId("perfil-voluntario")).toBeTruthy();
    expect(mockGetMyVolunteerProfile).toHaveBeenCalledTimes(2);
  });

  it("sem conexão, fala de conexão", async () => {
    mockGetMyVolunteerProfile.mockRejectedValue(new NetworkError());
    await render(<VolunteerProfilePanel />);
    expect(await screen.findByText(/Verifique sua conexão/)).toBeTruthy();
  });

  it("ignora a resposta que chega depois de desmontar, sucesso ou falha", async () => {
    let resolve!: (value: unknown) => void;
    let reject!: (reason: unknown) => void;
    mockGetMyVolunteerProfile
      .mockReturnValueOnce(new Promise((r) => (resolve = r)))
      .mockReturnValueOnce(new Promise((_, r) => (reject = r)));

    const first = await render(<VolunteerProfilePanel />);
    await act(async () => first.unmount());
    const second = await render(<VolunteerProfilePanel />);
    await act(async () => second.unmount());
    await act(async () => {
      resolve(PROFILE);
      reject(new Error("falha"));
    });

    expect(screen.queryByTestId("perfil-voluntario")).toBeNull();
  });

  describe("sem conexão: relê sozinha quando a conexão volta (PROD-32)", () => {
    type NetState = { isConnected: boolean; isInternetReachable: boolean };
    let emit: (state: NetState) => void;
    const OFFLINE = { isConnected: false, isInternetReachable: false };
    const ONLINE = { isConnected: true, isInternetReachable: true };

    beforeEach(() => {
      jest.useFakeTimers();
      emit = () => undefined;
      (NetInfo.addEventListener as jest.Mock).mockImplementation((cb: (state: NetState) => void) => {
        emit = cb;
        return jest.fn();
      });
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it("cai, volta e faz uma única releitura", async () => {
      mockGetMyVolunteerProfile.mockReset();
      mockGetMyVolunteerProfile.mockRejectedValueOnce(new NetworkError());
      mockGetMyVolunteerProfile.mockResolvedValue(PROFILE);
      await act(async () => {
        render(<VolunteerProfilePanel />);
      });
      expect(screen.getByTestId("perfil-voluntario-erro")).toBeTruthy();
      expect(mockGetMyVolunteerProfile).toHaveBeenCalledTimes(1);

      emit(OFFLINE);
      emit(ONLINE);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });

      expect(mockGetMyVolunteerProfile).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("perfil-ministerios")).toBeTruthy();
    });

    it("já online, sem ter visto a conexão cair, não recarrega", async () => {
      mockGetMyVolunteerProfile.mockReset();
      mockGetMyVolunteerProfile.mockRejectedValue(new NetworkError());
      await act(async () => {
        render(<VolunteerProfilePanel />);
      });
      expect(screen.getByTestId("perfil-voluntario-erro")).toBeTruthy();

      emit(ONLINE);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });

      expect(mockGetMyVolunteerProfile).toHaveBeenCalledTimes(1);
    });
  });
});
