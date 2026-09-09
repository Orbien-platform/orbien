// Marca da Orbien em vetor — o mesmo desenho do `BrandMark` do site
// (apps/site/src/components/layout/Header.tsx): órbita, núcleo e satélite,
// no viewBox 22x22.
//
// É o fallback de identidade da versão genérica: onde antes o app tentava
// desenhar `logoUrl` e, sem logo do tenant (ou com uma URL que não carrega),
// deixava um quadrado vazio no meio do header, agora desenha a marca da
// plataforma.
//
// `react-native-svg` já é dependência direta (package.json) e vem junto com
// `lucide-react-native`, então o vetor não custa bundle novo — e um vetor
// escala em qualquer densidade sem o PNG borrado dos assets nativos.
import Svg, { Circle, Ellipse } from "react-native-svg";

import { ICON_STROKE_WIDTH } from "../lib/theme/tokens";

interface BrandMarkProps {
  testID?: string;
  /** Lado do quadrado, em dp. */
  size?: number;
  /** Órbita e núcleo. */
  color: string;
  /** Satélite — o accent da paleta ativa. */
  accentColor: string;
}

export function BrandMark({ testID, size = 28, color, accentColor }: BrandMarkProps) {
  return (
    <Svg testID={testID} width={size} height={size} viewBox="0 0 22 22" fill="none">
      <Ellipse cx={11} cy={11} rx={9} ry={4} stroke={color} strokeWidth={ICON_STROKE_WIDTH} />
      <Circle cx={11} cy={11} r={3} fill={color} />
      <Circle cx={20} cy={11} r={2} fill={accentColor} />
    </Svg>
  );
}
