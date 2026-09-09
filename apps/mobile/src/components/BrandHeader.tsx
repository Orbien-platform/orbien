// Marca no topo do conteúdo (não numa barra).
//
// A barra de header do Expo Router saiu das abas: 56px + safe area em toda
// tela, sempre com o mesmo conteúdo, custavam mais espaço útil do que
// entregavam — a tab bar já diz em que aba o usuário está. A identidade
// (logo do tenant, ou a marca da Orbien na versão genérica) passa a
// aparecer uma vez, aqui, na primeira tela.
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "../lib/theme/theme-provider";
import { spacing, typography } from "../lib/theme/tokens";
import { BrandLogo } from "./BrandLogo";

const LOGO_SIZE = 28;

export function BrandHeader() {
  const { appName, colors, primaryColor, isDark } = useTheme();

  return (
    <View testID="brand-header" style={styles.row}>
      {/* Sobre `bgBase` a cor da marca só é legível no claro; no escuro o
          navy do tenant some no fundo, então a marca usa a cor de texto. */}
      <BrandLogo size={LOGO_SIZE} color={isDark ? colors.textPrimary : primaryColor} />
      <Text
        testID="brand-header-name"
        numberOfLines={1}
        style={[typography.h2, styles.name, { color: colors.textPrimary }]}
      >
        {appName}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  name: { flexShrink: 1 },
});
