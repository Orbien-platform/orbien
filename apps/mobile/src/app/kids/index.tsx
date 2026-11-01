// Kids — filhos do responsável (T31, KIDS-04). Linhas largas, não grade de
// cards (design.md, "Direção visual"): nome e idade à esquerda, chevron à
// direita. A ação primária fica fixa no rodapé.
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { AppButton } from "../../components/AppButton";
import { Screen } from "../../components/Screen";
import { StatusMessage } from "../../components/StatusMessage";
import { describeLoadError, type LoadErrorState } from "../../lib/api/load-error";
import { ageInMonths, formatAge, listChildren } from "../../lib/kids/kids-client";
import type { KidsChild } from "../../lib/kids/types";
import { Baby, ChevronRight, CircleAlert, ShieldCheck, WifiOff } from "../../lib/theme/icons";
import { useTheme } from "../../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, spacing, touchTarget, typography } from "../../lib/theme/tokens";

export default function KidsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [children, setChildren] = useState<KidsChild[] | null>(null);
  const [error, setError] = useState<LoadErrorState | null>(null);
  const hasListRef = useRef(false);

  const load = useCallback(() => {
    let cancelled = false;
    listChildren()
      .then((result) => {
        if (cancelled) return;
        hasListRef.current = true;
        setError(null);
        setChildren(result);
      })
      .catch((err: unknown) => {
        // Recarga ao voltar para a tela: a lista que já está nela fica.
        if (!cancelled && !hasListRef.current) setError(describeLoadError(err, "seus filhos"));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(load);

  if (error) {
    return (
      <StatusMessage
        testID="kids-error"
        icon={error.offline ? WifiOff : CircleAlert}
        message={error.message}
        description={error.description}
        tone="danger"
      >
        <AppButton testID="kids-retry" title="Tentar de novo" variant="secondary" onPress={load} />
      </StatusMessage>
    );
  }

  return (
    <Screen>
      <FlatList
        testID="kids-list"
        data={children ?? []}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        style={styles.list}
        ListEmptyComponent={
          // `null` é "ainda carregando": o vazio só vale depois da resposta.
          children !== null ? (
            <View testID="kids-empty" style={styles.empty}>
              <Baby size={iconSize.emphasis} color={colors.textTertiary} strokeWidth={ICON_STROKE_WIDTH} />
              <Text style={[typography.h3, { color: colors.textPrimary }]}>Nenhum filho cadastrado</Text>
              <Text style={[typography.body, { color: colors.textSecondary }]}>
                Cadastre a criança para fazer o check-in no culto.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            testID={`kids-child-${item.id}`}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/kids/crianca/[id]", params: { id: item.id } })}
            style={({ pressed }) => [
              styles.row,
              { borderBottomColor: colors.border },
              pressed && { backgroundColor: colors.bgSubtle },
            ]}
          >
            <View style={styles.rowText}>
              <Text style={[typography.h3, { color: colors.textPrimary }]}>{item.full_name}</Text>
              {item.birth_date ? (
                <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>
                  {formatAge(ageInMonths(item.birth_date))}
                </Text>
              ) : null}
            </View>
            <ChevronRight size={iconSize.inline} color={colors.textTertiary} strokeWidth={ICON_STROKE_WIDTH} />
          </Pressable>
        )}
        ListFooterComponent={
          <AppButton
            testID="kids-consent-link"
            title="Termo de consentimento"
            variant="ghost"
            icon={ShieldCheck}
            onPress={() => router.push("/kids/consentimento")}
          />
        }
      />
      <AppButton
        testID="kids-add"
        title="Cadastrar criança"
        onPress={() => router.push("/kids/crianca/novo")}
        style={styles.footer}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  row: {
    minHeight: touchTarget + spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, gap: spacing.xs },
  empty: { gap: spacing.sm, paddingVertical: spacing.xxxl, alignItems: "flex-start" },
  footer: { marginTop: spacing.md },
});
