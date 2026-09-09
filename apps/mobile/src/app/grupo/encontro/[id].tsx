// Tela de material do encontro (MOB-09) — lista os materiais visíveis pro
// papel do usuário (a API já filtra `leaders_only`); material pdf/doc abre
// o `file_url` no navegador do sistema, rich_text mostra o conteúdo na
// própria tela. Mostra "Registrar presença" só pra papel de liderança
// (mesmos papéis que `POST .../attendance` já exige no backend) — decisão
// não-autoritativa (design.md), a API reforça de verdade.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";

import { AppLink } from "../../../components/AppLink";
import { Card } from "../../../components/Card";
import { Screen } from "../../../components/Screen";
import { StatusMessage } from "../../../components/StatusMessage";
import { useAuth } from "../../../lib/auth/auth-provider";
import { decodeJwtPayload } from "../../../lib/auth/jwt";
import { listMaterials } from "../../../lib/pequenos-grupos/pequenos-grupos-client";
import type { MeetingMaterial } from "../../../lib/pequenos-grupos/types";
import { spacing, typography } from "../../../lib/theme/tokens";

const NETWORK_ERROR_MESSAGE = "Não foi possível carregar o material. Verifique sua conexão.";
const EMPTY_MESSAGE = "Nenhum material disponível para este encontro.";

const LEADER_ROLES = ["tenant_admin", "admin_congregation", "pastor", "secretary", "cell_leader"];

export default function EncontroScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
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
      <StatusMessage testID="encontro-error" message={error} tone="danger">
        <AppLink
          testID="encontro-retry"
          onPress={() => {
            setError(null);
            setRetryCount((n) => n + 1);
          }}
        >
          Tentar novamente
        </AppLink>
      </StatusMessage>
    );
  }

  return (
    <Screen testID="encontro-detail">
      {isLeader ? (
        <AppLink
          testID="registrar-presenca-link"
          style={styles.headerLink}
          onPress={() => router.push(`/grupo/encontro/${id}/presenca`)}
        >
          Registrar presença
        </AppLink>
      ) : null}

      {materials && materials.length === 0 ? (
        <View testID="encontro-materials-empty">
          <Text style={typography.body}>{EMPTY_MESSAGE}</Text>
        </View>
      ) : (
        (materials ?? []).map((m) => (
          <Card key={m.id} testID={`material-${m.id}`}>
            <Text style={typography.subtitle}>{m.material.title}</Text>
            {m.material.source_type === "rich_text" ? (
              <Text testID={`material-${m.id}-rich-content`} style={styles.richContent}>
                {m.material.rich_content}
              </Text>
            ) : (
              <AppLink
                testID={`material-${m.id}-abrir`}
                style={styles.materialLink}
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
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerLink: {
    marginBottom: spacing.md,
  },
  richContent: {
    ...typography.body,
    marginTop: spacing.xs,
  },
  materialLink: {
    marginTop: spacing.xs,
  },
});
