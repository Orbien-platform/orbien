// Contêiner padrão de tela: fundo, padding e, opcionalmente, centralização
// (usado pelos estados de erro/carregando/vazio — ver StatusMessage.tsx).
import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, spacing } from "../lib/theme/tokens";

interface ScreenProps {
  testID?: string;
  center?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

export function Screen({ testID, center, style, children }: ScreenProps) {
  return (
    <View testID={testID} style={[styles.screen, center && styles.center, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
});
