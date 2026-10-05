// QR em SVG: `qrcode-generator` (JS puro, sem dependência) monta a matriz e
// `react-native-svg` desenha. Um único `Path` com um quadrado por módulo
// escuro — centenas de `Rect` deixariam a tela lenta para montar a cada
// renovação do código.
//
// A placa é sempre branca com módulo escuro (`qr` em tokens.ts), nos dois
// modos: o tema não chega aqui de propósito.
import qrcode from "qrcode-generator";
import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

import { qr } from "../lib/theme/tokens";

interface QrCodeProps {
  value: string;
  size: number;
  testID?: string;
  accessibilityLabel?: string;
}

/** Matriz do QR em `d` de SVG, uma unidade por módulo, já com a margem. */
export function qrPath(value: string): { d: string; modules: number } {
  // Correção "M" (15%): o código fica menor que em "H" e ainda aguenta
  // reflexo de tela e um dedo na borda.
  const code = qrcode(0, "M");
  code.addData(value);
  code.make();
  const count = code.getModuleCount();
  const parts: string[] = [];
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (code.isDark(row, col)) {
        parts.push(`M${col + qr.quietZone} ${row + qr.quietZone}h1v1h-1z`);
      }
    }
  }
  return { d: parts.join(""), modules: count + qr.quietZone * 2 };
}

export function QrCode({ value, size, testID, accessibilityLabel }: QrCodeProps) {
  const { d, modules } = useMemo(() => qrPath(value), [value]);

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? "Código QR"}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${modules} ${modules}`}>
        <Rect x={0} y={0} width={modules} height={modules} fill={qr.plate} />
        <Path d={d} fill={qr.module} />
      </Svg>
    </View>
  );
}
