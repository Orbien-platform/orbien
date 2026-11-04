import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockGetMyVolunteerProfile = jest.fn();
jest.mock("../../lib/escala/escala-client", () => ({
  getMyVolunteerProfile: (...args: unknown[]) => mockGetMyVolunteerProfile(...args),
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
};

describe("VolunteerProfilePanel", () => {
  beforeEach(() => jest.clearAllMocks());

  it("mostra ministérios, habilidades, disponibilidade, restrições e histórico", async () => {
    mockGetMyVolunteerProfile.mockResolvedValue(PROFILE);
    await render(<VolunteerProfilePanel />);

    expect(await screen.findByText("Mídia (líder) e Recepção")).toBeTruthy();
    expect(screen.getByText("ProPresenter e OBS")).toBeTruthy();
    expect(screen.getByText("Dom manhã e noite, Qua noite")).toBeTruthy();
    expect(screen.getByText("Não pode carregar peso")).toBeTruthy();
    expect(screen.getByText("96 escalas servidas, desde março 2024")).toBeTruthy();
    expect(screen.getByText("Para mudar o perfil, fale com a secretaria da igreja.")).toBeTruthy();
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
    expect(screen.getByText("Não informada")).toBeTruthy();
    expect(screen.queryByTestId("perfil-restricoes")).toBeNull();
    expect(screen.getByText(/^1 escala servida,/)).toBeTruthy();
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
