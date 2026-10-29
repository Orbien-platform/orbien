import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QrReader } from "./QrReader";

type Detect = (src: unknown) => Promise<{ rawValue: string }[]>;

function installCamera(detect: Detect, getUserMedia?: () => Promise<unknown>) {
  const stop = vi.fn();
  const stream = { getTracks: () => [{ stop }] };
  class FakeDetector {
    constructor(public opts: unknown) {}
    detect = detect;
  }
  vi.stubGlobal("BarcodeDetector", FakeDetector);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(getUserMedia ?? (async () => stream)) },
  });
  // jsdom não implementa play()
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  return { stop };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
});

describe("QrReader — leitor de mão (digita como teclado)", () => {
  it("entrega o texto lido ao apertar Enter e limpa o campo para a próxima leitura", async () => {
    const user = userEvent.setup();
    const onRead = vi.fn();
    render(<QrReader onRead={onRead} />);
    await user.type(screen.getByLabelText("Ler QR"), "kidsci1.abc.def{Enter}");
    expect(onRead).toHaveBeenCalledWith("kidsci1.abc.def");
    expect(screen.getByLabelText("Ler QR")).toHaveValue("");
  });

  it("não dispara com o campo vazio ou só com espaços", async () => {
    const user = userEvent.setup();
    const onRead = vi.fn();
    render(<QrReader onRead={onRead} />);
    await user.type(screen.getByLabelText("Ler QR"), "   {Enter}");
    expect(onRead).not.toHaveBeenCalled();
  });

  it("desabilitado, não aceita leitura", () => {
    render(<QrReader onRead={vi.fn()} disabled />);
    expect(screen.getByLabelText("Ler QR")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ler" })).toBeDisabled();
  });

  it("sem BarcodeDetector no navegador, não oferece câmera (só o campo de texto)", () => {
    render(<QrReader onRead={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /câmera/i })).not.toBeInTheDocument();
  });

  it("com BarcodeDetector mas sem acesso à câmera (mediaDevices ausente), também não oferece câmera", () => {
    vi.stubGlobal("BarcodeDetector", class {});
    render(<QrReader onRead={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /câmera/i })).not.toBeInTheDocument();
  });
});

describe("QrReader — câmera (BarcodeDetector)", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));

  it("abre a câmera, entrega a primeira leitura, fecha e solta a câmera", async () => {
    const detect = vi
      .fn<Detect>()
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ rawValue: "kidsco1.x.A2B3.sig" }]);
    const { stop } = installCamera(detect);
    const onRead = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<QrReader onRead={onRead} />);

    await user.click(await screen.findByRole("button", { name: "Abrir câmera" }));
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ video: { facingMode: "environment" } });
    expect(await screen.findByRole("button", { name: "Fechar câmera" })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(onRead).toHaveBeenCalledTimes(1);
    expect(onRead).toHaveBeenCalledWith("kidsco1.x.A2B3.sig");
    expect(stop).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Abrir câmera" })).toBeInTheDocument();
  });

  it("fechar a câmera sem leitura solta o fluxo e não entrega nada", async () => {
    const { stop } = installCamera(async () => []);
    const onRead = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<QrReader onRead={onRead} />);
    await user.click(await screen.findByRole("button", { name: "Abrir câmera" }));
    await user.click(await screen.findByRole("button", { name: "Fechar câmera" }));
    expect(stop).toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(onRead).not.toHaveBeenCalled();
  });

  it("câmera negada: explica e mantém o campo de texto como caminho", async () => {
    installCamera(async () => [], async () => {
      throw new Error("NotAllowedError");
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<QrReader onRead={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Abrir câmera" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível abrir a câmera");
    expect(screen.getByLabelText("Ler QR")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Abrir câmera" })).toBeInTheDocument();
  });

  it("o fluxo que chega depois de fechar a câmera é solto na hora", async () => {
    let release: (s: unknown) => void = () => {};
    const stop = vi.fn();
    installCamera(async () => [], () => new Promise((r) => (release = r)));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<QrReader onRead={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Abrir câmera" }));
    await user.click(screen.getByRole("button", { name: "Fechar câmera" }));
    await act(async () => release({ getTracks: () => [{ stop }] }));
    expect(stop).toHaveBeenCalled();
  });

  it("erro numa leitura de quadro não derruba a câmera: segue tentando", async () => {
    const detect = vi
      .fn<Detect>()
      .mockRejectedValueOnce(new Error("quadro ruim"))
      .mockResolvedValue([{ rawValue: "kidsci1.a.b" }]);
    installCamera(detect);
    const onRead = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<QrReader onRead={onRead} />);
    await user.click(await screen.findByRole("button", { name: "Abrir câmera" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(onRead).toHaveBeenCalledWith("kidsci1.a.b");
  });

  it("a leitura que termina depois de fechar a câmera é descartada", async () => {
    let finish: (v: { rawValue: string }[]) => void = () => {};
    installCamera(() => new Promise((r) => (finish = r)));
    const onRead = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<QrReader onRead={onRead} />);
    await user.click(await screen.findByRole("button", { name: "Abrir câmera" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await user.click(screen.getByRole("button", { name: "Fechar câmera" }));
    await act(async () => finish([{ rawValue: "kidsci1.tarde.demais" }]));
    expect(onRead).not.toHaveBeenCalled();
  });

  it("enquanto um quadro ainda está sendo lido, o seguinte não dispara outra leitura", async () => {
    let finish: (v: { rawValue: string }[]) => void = () => {};
    const detect = vi.fn<Detect>(() => new Promise((r) => (finish = r)));
    installCamera(detect);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<QrReader onRead={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Abrir câmera" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(detect).toHaveBeenCalledTimes(1);
    await act(async () => finish([]));
  });

  it("câmera negada depois de fechada não mostra erro", async () => {
    let fail: (e: Error) => void = () => {};
    installCamera(async () => [], () => new Promise((_r, rej) => (fail = rej)));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<QrReader onRead={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Abrir câmera" }));
    await user.click(screen.getByRole("button", { name: "Fechar câmera" }));
    await act(async () => fail(new Error("NotAllowedError")));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("vídeo que não consegue tocar não impede a leitura", async () => {
    installCamera(async () => [{ rawValue: "kidsci1.a.b" }]);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new Error("autoplay"));
    const onRead = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<QrReader onRead={onRead} />);
    await user.click(await screen.findByRole("button", { name: "Abrir câmera" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(onRead).toHaveBeenCalledWith("kidsci1.a.b");
  });
});
