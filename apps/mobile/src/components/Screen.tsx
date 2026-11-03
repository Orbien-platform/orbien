// Contêiner padrão de tela (§3 do STYLE-GUIDE.md): fundo semântico
// `bg-base`, padding horizontal por largura (16px até 375px, 20px acima) e
// respeito à safe area inferior — `useSafeAreaInsets().bottom + 8`, nunca
// valor fixo.
//
// `scroll` troca a View por ScrollView: telas de detalhe (OC, post,
// material, indisponibilidade) crescem além da altura da tela e antes
// cortavam o conteúdo em aparelho pequeno.
import { useEffect, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useReduceMotion } from "../lib/a11y/use-reduce-motion";
import { useTheme } from "../lib/theme/theme-provider";
import { screenPadding, spacing } from "../lib/theme/tokens";

interface ScreenProps {
  testID?: string;
  center?: boolean;
  scroll?: boolean;
  /** Desliga o padding horizontal — para lista que sangra até a borda. */
  edgeToEdge?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

// Transição de entrada da v2 (PROD-33): fade + translateY(3px), 180 ms
// ease-out. O fade é da navegação (`animation: "fade"` no Stack de
// `app/_layout.tsx`); aqui entra só o deslocamento de 3px, no conteúdo —
// o header nativo fica parado. "Reduzir movimento" tira o deslocamento e
// deixa o fade, que não é movimento.
export const ENTER_MS = 180;
export const ENTER_OFFSET = 3;

function useEnterOffset(): Animated.Value {
  const reduce = useReduceMotion();
  const [offset] = useState(() => new Animated.Value(ENTER_OFFSET));

  useEffect(() => {
    if (reduce) {
      offset.setValue(0);
      return;
    }
    const anim = Animated.timing(offset, {
      toValue: 0,
      duration: ENTER_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [reduce, offset]);

  return offset;
}

/** Padding horizontal da tela conforme §3 do guia. Exportado porque uma
 * lista `edgeToEdge` precisa reaplicá-lo item a item. */
export function useScreenPadding(): number {
  const { width } = useWindowDimensions();
  return width > 375 ? screenPadding.regular : screenPadding.compact;
}

export function Screen({
  testID,
  center,
  scroll,
  edgeToEdge,
  style,
  children,
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const horizontal = useScreenPadding();
  const offset = useEnterOffset();
  const enter = { transform: [{ translateY: offset }] };

  const padding: ViewStyle = {
    paddingHorizontal: edgeToEdge ? 0 : horizontal,
    paddingTop: spacing.lg,
    paddingBottom: insets.bottom + spacing.sm,
  };

  if (scroll) {
    return (
      <Animated.ScrollView
        testID={testID}
        style={[styles.flex, { backgroundColor: colors.bgBase }, enter]}
        contentContainerStyle={[padding, center && styles.center, style]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </Animated.ScrollView>
    );
  }

  return (
    <Animated.View
      testID={testID}
      style={[styles.flex, { backgroundColor: colors.bgBase }, padding, center && styles.center, style, enter]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
});
