// Texto pressionável estilizado como link (cor de marca do tenant) — usado
// nos lugares que já eram <Text onPress=...> (ex.: "Tentar novamente",
// "Ver Ordem de Culto"), só trocando o visual, nunca o comportamento.
// `disabled` só entra em accessibilityState quando informado, pra não
// mudar a forma das props em telas que nunca tiveram essa noção.
import type { ReactNode } from "react";
import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";

import { useTheme } from "../lib/theme/theme-provider";
import { colors } from "../lib/theme/tokens";

interface AppLinkProps {
  testID?: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
}

export function AppLink({ testID, onPress, disabled, style, children }: AppLinkProps) {
  const theme = useTheme();

  return (
    <Text
      testID={testID}
      onPress={disabled ? undefined : onPress}
      {...(disabled !== undefined ? { accessibilityState: { disabled } } : {})}
      style={[styles.link, { color: disabled ? colors.textMuted : theme.primaryColor }, style]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  link: {
    fontSize: 15,
    fontWeight: "600",
  },
});
