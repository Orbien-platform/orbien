// Alerta inline de erro/sucesso — o padrão que estava repetido como um
// `<Text style={{color: colors.danger}}>` solto em cinco telas (Escala,
// Conteúdo, Login, Presença, Indisponibilidade).
//
// Ícone + fundo `*-dim`, pela mesma razão que o §7 do guia dá para o badge
// de status: cor sozinha não comunica para quem não distingue vermelho de
// verde. `messageTestID` fica no <Text> porque os testes das telas
// comparam o texto exato da mensagem.
import { StyleSheet, Text, View } from "react-native";

import { CircleAlert, CircleCheck, type IconProps } from "../lib/theme/icons";
import { useTheme } from "../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, radius, spacing, typography } from "../lib/theme/tokens";

interface AlertProps {
  messageTestID?: string;
  message: string;
  tone?: "danger" | "success";
  icon?: React.ComponentType<IconProps>;
}

export function Alert({ messageTestID, message, tone = "danger", icon }: AlertProps) {
  const { colors } = useTheme();
  const isDanger = tone === "danger";
  const foreground = isDanger ? colors.danger : colors.success;
  const Icon = icon ?? (isDanger ? CircleAlert : CircleCheck);

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.alert,
        { backgroundColor: isDanger ? colors.dangerDim : colors.successDim },
      ]}
    >
      <Icon size={iconSize.inline} color={foreground} strokeWidth={ICON_STROKE_WIDTH} />
      <Text
        testID={messageTestID}
        style={[typography.bodyMedium, styles.text, { color: foreground }]}
      >
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  alert: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderRadius: radius.btn,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  text: { flex: 1 },
});
