// Moldura das telas cheias de QR (check-in do líder, leitor do membro,
// autocadastro projetado): sem header da pilha — o código ocupa a tela — e
// com um "Fechar" próprio no canto, abaixo da safe area superior.
//
// `overCamera` troca a cor do botão para a tinta clara de `qr.scanInk`: em
// cima da imagem da câmera o tema não vale.
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { X } from "../lib/theme/icons";
import { useTheme } from "../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, qr, spacing, touchTarget } from "../lib/theme/tokens";

interface FullScreenFrameProps {
  testID?: string;
  overCamera?: boolean;
  children: ReactNode;
}

/** Espaço que o conteúdo reserva no topo para não passar por baixo do
 * botão de fechar. */
export function useFrameTopInset(): number {
  return useSafeAreaInsets().top + touchTarget + spacing.sm;
}

export function FullScreenFrame({ testID, overCamera, children }: FullScreenFrameProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <View testID={testID} style={[styles.flex, { backgroundColor: colors.bgBase }]}>
      {children}
      <Pressable
        testID="fullscreen-fechar"
        accessibilityRole="button"
        accessibilityLabel="Fechar"
        onPress={() => router.back()}
        style={[styles.close, { top: insets.top + spacing.sm }]}
      >
        <X
          size={iconSize.action}
          color={overCamera ? qr.scanInk : colors.textPrimary}
          strokeWidth={ICON_STROKE_WIDTH}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  close: {
    position: "absolute",
    left: spacing.sm,
    width: touchTarget,
    height: touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
});
