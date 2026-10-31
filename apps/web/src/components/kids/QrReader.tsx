"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Camera, CameraOff } from "lucide-react";
import { Input } from "@/components/ui/input";

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

/** `BarcodeDetector` não está no `lib.dom` do TypeScript e nem em todo navegador. */
function detectorCtor(): BarcodeDetectorCtor | undefined {
  return (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
}

const SCAN_EVERY_MS = 250;

function cameraSupported(): boolean {
  return detectorCtor() !== undefined && typeof navigator.mediaDevices?.getUserMedia === "function";
}
const noSubscription = () => () => undefined;

interface QrReaderProps {
  /** O texto do QR, como lido. Quem recebe decide o que ele significa. */
  onRead: (text: string) => void;
  disabled?: boolean;
}

/**
 * Leitura de QR no balcão por dois caminhos que dão no mesmo `onRead`: o campo
 * de texto, que serve ao leitor de mão (ele digita o conteúdo como um teclado e
 * termina com Enter) e a quem quiser colar o código; e a câmera, só nos
 * navegadores que têm `BarcodeDetector` — sem biblioteca extra, sem peso no
 * bundle. Onde não há câmera, o campo de texto é o caminho inteiro.
 */
export function QrReader({ onRead, disabled = false }: QrReaderProps) {
  const [text, setText] = useState("");
  // No servidor a resposta é "não": decidir no render do cliente desalinharia a hidratação.
  const cameraAvailable = useSyncExternalStore(noSubscription, cameraSupported, () => false);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const onReadRef = useRef(onRead);

  useEffect(() => {
    onReadRef.current = onRead;
  });

  useEffect(() => {
    if (!scanning) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;

    function release() {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    }

    (async () => {
      try {
        const detector = new (detectorCtor() as BarcodeDetectorCtor)({ formats: ["qr_code"] });
        const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = media;
        // O <video> existe sempre que `scanning` é verdadeiro: é o que o renderiza.
        const video = videoRef.current as HTMLVideoElement;
        video.srcObject = media;
        await video.play().catch(() => undefined);
        let busy = false;
        timer = setInterval(async () => {
          if (busy) return;
          busy = true;
          try {
            const found = await detector.detect(video);
            if (found.length > 0 && !stopped) {
              release();
              setScanning(false);
              onReadRef.current(found[0].rawValue);
            }
          } catch {
            // Quadro que não decodifica não é erro: o próximo tenta de novo.
          } finally {
            busy = false;
          }
        }, SCAN_EVERY_MS);
      } catch {
        if (!stopped) {
          setCameraError("Não foi possível abrir a câmera. Use o leitor ou digite o código do QR.");
          setScanning(false);
        }
      }
    })();

    return release;
  }, [scanning]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (value === "") return;
    setText("");
    onRead(value);
  }

  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={submit} className="flex max-w-xl items-center gap-2">
        <Input
          aria-label="Ler QR"
          placeholder="Leia o QR com o leitor ou cole o código"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          className="h-9 rounded-[8px] font-mono"
        />
        <button
          type="submit"
          disabled={disabled}
          className="rounded-full border border-[var(--border-strong)] px-3 py-1.5 text-sm font-medium text-ink outline-none transition-colors hover:border-teal hover:text-teal focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50 dark:text-white"
        >
          Ler
        </button>
        {cameraAvailable ? (
          <button
            type="button"
            onClick={() => {
              setCameraError(null);
              setScanning((s) => !s);
            }}
            disabled={disabled}
            className="flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-3 py-1.5 text-sm font-medium text-ink outline-none transition-colors hover:border-teal hover:text-teal focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50 dark:text-white"
          >
            {scanning ? <CameraOff size={14} strokeWidth={1.6} aria-hidden="true" /> : <Camera size={14} strokeWidth={1.6} aria-hidden="true" />}
            {scanning ? "Fechar câmera" : "Abrir câmera"}
          </button>
        ) : null}
      </form>
      {cameraError ? (
        <p role="alert" className="text-sm text-crimson">
          {cameraError}
        </p>
      ) : null}
      {scanning ? (
        <video
          ref={videoRef}
          muted
          playsInline
          aria-label="Câmera lendo o QR"
          className="aspect-video w-full max-w-sm rounded-[12px] border border-[var(--border-default)] bg-black object-cover"
        />
      ) : null}
    </div>
  );
}
