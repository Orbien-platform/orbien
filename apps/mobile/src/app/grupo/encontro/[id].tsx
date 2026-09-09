// Tela de material do encontro (MOB-09) — lista os materiais visíveis pro
// papel do usuário (a API já filtra `leaders_only`); material pdf/doc abre
// o `file_url` no navegador do sistema, rich_text mostra o conteúdo na
// própria tela. Mostra "Registrar presença" só pra papel de liderança
// (mesmos papéis que `POST .../attendance` já exige no backend) — decisão
// não-autoritativa (design.md), a API reforça de verdade.
//
// Visual conforme STYLE-GUIDE.md: `Screen scroll` (material rich_text é
// texto longo e a tela não rolava), "Registrar presença" como botão de
// verdade em vez de um link de ~20px de alvo, e cada material com o ícone
// do seu tipo (§5) — antes um pdf e um estudo em texto eram visualmente
// idênticos.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";

import { AppButton } from "../../../components/AppButton";
import { AppLink } from "../../../components/AppLink";
import { Card } from "../../../components/Card";
import { Screen } from "../../../components/Screen";
import { SectionLabel } from "../../../components/SectionLabel";
import { StatusMessage } from "../../../components/StatusMessage";
import { useAuth } from "../../../lib/auth/auth-provider";
import { decodeJwtPayload } from "../../../lib/auth/jwt";
import { listMaterials } from "../../../lib/pequenos-grupos/pequenos-grupos-client";
import type { MeetingMaterial } from "../../../lib/pequenos-grupos/types";
import {
  BookOpen,
  ExternalLink,
  FileText,
  RefreshCw,
  UserCheck,
  WifiOff,
} from "../../../lib/theme/icons";
import { useTheme } from "../../../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, spacing, typography } from "../../../lib/theme/tokens";

const NETWORK_ERROR_MESSAGE = "Não foi possível carregar o material. Verifique sua conexão.";
const EMPTY_MESSAGE = "Nenhum material disponível para este encontro.";

const LEADER_ROLES = ["tenant_admin", "admin_congregation", "pastor", "secretary", "cell_leader"];

export default function EncontroScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const { colors } = useTheme();
  const roles = session ? decodeJwtPayload(session.accessToken)?.roles ?? [] : [];
  const isLeader = roles.some((r) => LEADER_ROLES.includes(r));

  const [materials, setMaterials] = useState<MeetingMaterial[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    listMaterials(id)
      .then((result) => {
        if (cancelled) return;
        setMaterials(result);
      })
      .catch(() => {
        if (cancelled) return;
        setError(NETWORK_ERROR_MESSAGE);
      });

    return () => {
      cancelled = true;
    };
  }, [id, retryCount]);

  if (error) {
    return (
      <StatusMessage testID="encontro-error" icon={WifiOff} message={error} tone="danger">
        <AppButton
          testID="encontro-retry"
          title="Tentar novamente"
          icon={RefreshCw}
          variant="secondary"
          onPress={() => {
            setError(null);
            setRetryCount((n) => n + 1);
          }}
        />
      </StatusMessage>
    );
  }

  return (
    <Screen scroll testID="encontro-detail">
      {isLeader ? (
        <AppButton
          testID="registrar-presenca-link"
          title="Registrar presença"
          icon={UserCheck}
          onPress={() => router.push(`/grupo/encontro/${id}/presenca`)}
          style={styles.presencaButton}
        />
      ) : null}

      {materials && materials.length === 0 ? (
        <View testID="encontro-materials-empty" style={styles.empty}>
          <BookOpen
            size={iconSize.emphasis}
            color={colors.textTertiary}
            strokeWidth={ICON_STROKE_WIDTH}
          />
          <Text style={[typography.body, styles.emptyText, { color: colors.textSecondary }]}>
            {EMPTY_MESSAGE}
          </Text>
        </View>
      ) : (
        <>
          {materials && materials.length > 0 ? (
            <SectionLabel trailing={String(materials.length)}>Material</SectionLabel>
          ) : null}
          {(materials ?? []).map((m) => {
            const isRichText = m.material.source_type === "rich_text";
            const Icon = isRichText ? BookOpen : FileText;

            return (
              <Card key={m.id} testID={`material-${m.id}`}>
                <View style={styles.materialHeader}>
                  <Icon
                    size={iconSize.action}
                    color={colors.textSecondary}
                    strokeWidth={ICON_STROKE_WIDTH}
                  />
                  <Text style={[typography.h3, styles.materialTitle, { color: colors.textPrimary }]}>
                    {m.material.title}
                  </Text>
                </View>

                {isRichText ? (
                  <Text
                    testID={`material-${m.id}-rich-content`}
                    style={[typography.body, styles.richContent, { color: colors.textSecondary }]}
                  >
                    {m.material.rich_content}
                  </Text>
                ) : (
                  <AppLink
                    testID={`material-${m.id}-abrir`}
                    icon={ExternalLink}
                    disabled={!m.material.file_url}
                    onPress={
                      m.material.file_url
                        ? () => Linking.openURL(m.material.file_url as string)
                        : undefined
                    }
                  >
                    Abrir
                  </AppLink>
                )}
              </Card>
            );
          })}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  presencaButton: { marginBottom: spacing.lg },
  materialHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  materialTitle: { flex: 1 },
  richContent: { marginTop: spacing.md },
  empty: {
    alignItems: "center",
    paddingVertical: spacing.xxxl,
  },
  emptyText: {
    marginTop: spacing.lg,
    textAlign: "center",
    maxWidth: 280,
  },
});
