// Estado centralizado (erro/vazio/carregando) — o mesmo bloco
// `<View style={{flex:1, alignItems:"center", justifyContent:"center"}}>`
// se repetia, idêntico, em toda tela de lista/detalhe. `children` carrega
// a ação opcional (ex.: AppLink/AppButton de "Tentar novamente").
import type { ReactNode } from "react";
import { StyleSheet, Text } from "react-native";

import { colors, spacing, typography } from "../lib/theme/tokens";
import { Screen } from "./Screen";

interface StatusMessageProps {
  testID: string;
  message: string;
  tone?: "default" | "danger";
  children?: ReactNode;
}

export function StatusMessage({ testID, message, tone = "default", children }: StatusMessageProps) {
  return (
    <Screen testID={testID} center>
      <Text style={[styles.message, tone === "danger" && styles.danger]}>{message}</Text>
      {children}
    </Screen>
  );
}

const styles = StyleSheet.create({
  message: {
    ...typography.body,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  danger: {
    color: colors.danger,
  },
});
