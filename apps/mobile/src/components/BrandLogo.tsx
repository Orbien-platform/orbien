// Identidade visual em tela: o logo do tenant quando existe, a marca da
// Orbien quando não existe — e também quando a URL do tenant não carrega.
//
// O `onError` não é detalhe: um `<Image>` com URI quebrada não desenha
// nada e não avisa, e era isso que aparecia como um retângulo vazio no
// topo da área logada. Aqui a falha cai no vetor da plataforma em vez de
// deixar um buraco no layout.
import { useState } from "react";
import { Image, StyleSheet, type StyleProp, type ImageStyle } from "react-native";

import { useTheme } from "../lib/theme/theme-provider";
import { BrandMark } from "./BrandMark";

interface BrandLogoProps {
  /** Lado do quadrado, em dp — vale para o logo do tenant e para a marca. */
  size?: number;
  /** Cor da órbita/núcleo da marca da plataforma (ignorada pelo logo do
   * tenant, que é imagem pronta). */
  color?: string;
  style?: StyleProp<ImageStyle>;
}

export function BrandLogo({ size = 28, color, style }: BrandLogoProps) {
  const { logoUrl, logoUrlDark, accentColor, colors, isDark } = useTheme();
  // Sem variante escura cadastrada, `logoUrlDark` é nulo e cai no claro —
  // mesma degradação que o resto da cadeia de branding (./brand-theme.ts).
  const activeLogoUrl = (isDark ? logoUrlDark : null) ?? logoUrl;
  // A falha é guardada por URL, não como booleano: trocar de tenant (ou o
  // `GET /settings` chegar depois do cache) troca a URL, e um booleano
  // manteria a marca genérica para sempre, mesmo com um logo novo e
  // válido. Derivar em render também evita `setState` dentro de efeito.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = failedUrl !== null && failedUrl === activeLogoUrl;

  if (activeLogoUrl && !failed) {
    return (
      <Image
        testID="brand-logo"
        source={{ uri: activeLogoUrl }}
        style={[{ width: size, height: size }, styles.logo, style]}
        resizeMode="contain"
        onError={() => setFailedUrl(activeLogoUrl)}
      />
    );
  }

  return (
    <BrandMark
      testID="brand-mark"
      size={size}
      color={color ?? colors.textPrimary}
      accentColor={accentColor}
    />
  );
}

const styles = StyleSheet.create({
  logo: { alignSelf: "center" },
});
