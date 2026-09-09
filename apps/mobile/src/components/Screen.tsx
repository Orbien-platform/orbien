// Contêiner padrão de tela (§3 do STYLE-GUIDE.md): fundo semântico
// `bg-base`, padding horizontal por largura (16px até 375px, 20px acima) e
// respeito à safe area inferior — `useSafeAreaInsets().bottom + 8`, nunca
// valor fixo.
//
// `scroll` troca a View por ScrollView: telas de detalhe (OC, post,
// material, indisponibilidade) crescem além da altura da tela e antes
// cortavam o conteúdo em aparelho pequeno.
import type { ReactNode } from "react";
import {
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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

  const padding: ViewStyle = {
    paddingHorizontal: edgeToEdge ? 0 : horizontal,
    paddingTop: spacing.lg,
    paddingBottom: insets.bottom + spacing.sm,
  };

  if (scroll) {
    return (
      <ScrollView
        testID={testID}
        style={[styles.flex, { backgroundColor: colors.bgBase }]}
        contentContainerStyle={[padding, center && styles.center, style]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View
      testID={testID}
      style={[styles.flex, { backgroundColor: colors.bgBase }, padding, center && styles.center, style]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
});
