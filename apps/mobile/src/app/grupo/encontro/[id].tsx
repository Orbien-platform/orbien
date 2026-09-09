// Tela de material do encontro (MOB-09) — lista os materiais visíveis pro
// papel do usuário (a API já filtra `leaders_only`); material pdf/doc abre
// o `file_url` no navegador do sistema, rich_text mostra o conteúdo na
// própria tela. Mostra "Registrar presença" só pra papel de liderança
// (mesmos papéis que `POST .../attendance` já exige no backend) — decisão
// não-autoritativa (design.md), a API reforça de verdade.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Text, View } from "react-native";

import { useAuth } from "../../../lib/auth/auth-provider";
import { decodeJwtPayload } from "../../../lib/auth/jwt";
import { listMaterials } from "../../../lib/pequenos-grupos/pequenos-grupos-client";
import type { MeetingMaterial } from "../../../lib/pequenos-grupos/types";

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
  }, [id]);

  if (error) {
    return (
      <View testID="encontro-error" style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>{error}</Text>
      </View>
    );
  }

  return (
    <View testID="encontro-detail" style={{ flex: 1 }}>
      {isLeader ? (
        <Text
          testID="registrar-presenca-link"
          onPress={() => router.push(`/grupo/encontro/${id}/presenca`)}
        >
          Registrar presença
        </Text>
      ) : null}

      {materials && materials.length === 0 ? (
        <View testID="encontro-materials-empty">
          <Text>{EMPTY_MESSAGE}</Text>
        </View>
      ) : (
        (materials ?? []).map((m) => (
          <View key={m.id} testID={`material-${m.id}`}>
            <Text>{m.material.title}</Text>
            {m.material.source_type === "rich_text" ? (
              <Text testID={`material-${m.id}-rich-content`}>{m.material.rich_content}</Text>
            ) : (
              <Text
                testID={`material-${m.id}-abrir`}
                onPress={
                  m.material.file_url
                    ? () => Linking.openURL(m.material.file_url as string)
                    : undefined
                }
                accessibilityState={{ disabled: !m.material.file_url }}
              >
                Abrir
              </Text>
            )}
          </View>
        ))
      )}
    </View>
  );
}
