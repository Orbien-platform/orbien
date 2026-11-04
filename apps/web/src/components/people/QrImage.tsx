import qrcode from "qrcode-generator";
import { useMemo } from "react";

interface QrImageProps {
  value: string;
  /** Lado em px. */
  size?: number;
  label?: string;
}

/** Margem de 4 módulos — o mínimo que a especificação do QR pede para leitura. */
const QUIET_ZONE = 4;

/**
 * QR em SVG, sem imagem de terceiros e sem pedir nada à rede. Placa branca com
 * módulo escuro nos dois temas: o leitor da câmera depende do contraste, não da
 * paleta da tela — mesma regra do app (`QrCode.tsx`).
 */
export function QrImage({ value, size = 224, label = "Código QR" }: QrImageProps) {
  const { d, modules } = useMemo(() => {
    const code = qrcode(0, "M");
    code.addData(value);
    code.make();
    const count = code.getModuleCount();
    const parts: string[] = [];
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (code.isDark(row, col)) parts.push(`M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`);
      }
    }
    return { d: parts.join(""), modules: count + QUIET_ZONE * 2 };
  }, [value]);

  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${modules} ${modules}`}
      shapeRendering="crispEdges"
      className="max-w-full rounded-[8px]"
    >
      <rect width={modules} height={modules} fill="#ffffff" />
      <path d={d} fill="#0b1f3a" />
    </svg>
  );
}
