// Transição de entrada (v2, Login): logo depois do login, uma tela na cor da
// igreja, com o logo e o nome dela, enquanto o `GET /settings` desta sessão
// aplica a identidade. O login não escolhe igreja — a conta já sabe qual é —,
// e é aqui que a pessoa vê que entrou na dela.
//
// Fica no ar até o branding resolver, com um mínimo (para não piscar quando
// a rede é rápida) e um teto (para não prender ninguém quando a rede falha:
// sem resposta, a tela some e o app segue no tema que já tinha, como manda o
// AC 2 do "Tema por tenant"). Sai em fade; com "reduzir movimento" ligado,
// sai sem animação.
import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../lib/theme/theme-provider";
import { spacing, typography } from "../lib/theme/tokens";
import { BrandLogo } from "./BrandLogo";

/** Tempo mínimo na tela, para a troca de cor ser lida e não piscar. */
export const WELCOME_MIN_MS = 900;
/** Teto: sem resposta do `GET /settings` até aqui, a tela sai mesmo assim. */
export const WELCOME_MAX_MS = 3000;
const FADE_MS = 180;
const LOGO_SIZE = 76;

interface ChurchWelcomeProps {
  onFinish: () => void;
}

export function ChurchWelcome({ onFinish }: ChurchWelcomeProps) {
  const { appName, primaryColor, colors, brandingResolved } = useTheme();
  const [minElapsed, setMinElapsed] = useState(false);
  const [maxElapsed, setMaxElapsed] = useState(false);
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const min = setTimeout(() => setMinElapsed(true), WELCOME_MIN_MS);
    const max = setTimeout(() => setMaxElapsed(true), WELCOME_MAX_MS);
    return () => {
      clearTimeout(min);
      clearTimeout(max);
    };
  }, []);

  const leaving = minElapsed && (brandingResolved || maxElapsed);

  useEffect(() => {
    if (!leaving) return;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) {
          onFinish();
          return;
        }
        Animated.timing(opacity, {
          toValue: 0,
          duration: FADE_MS,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }).start(() => onFinish());
      });
    return () => {
      cancelled = true;
    };
  }, [leaving, onFinish, opacity]);

  return (
    <Animated.View
      testID="church-welcome"
      accessibilityLiveRegion="polite"
      style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: primaryColor, opacity }]}
    >
      <View style={styles.logo}>
        <BrandLogo size={LOGO_SIZE} color={colors.textOnBrand} />
      </View>
      <Text
        style={[typography.h1, styles.name, { color: colors.textOnBrand }]}
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {appName}
      </Text>
      <Text style={[typography.bodyMedium, styles.caption, { color: colors.textOnBrand }]}>
        Aplicando a identidade da sua igreja…
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
    zIndex: 10,
  },
  logo: { marginBottom: spacing.lg },
  name: { textAlign: "center" },
  caption: { marginTop: spacing.sm, opacity: 0.75 },
});
