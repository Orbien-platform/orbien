// Tela Celebrações (MOB-08) — lista as celebrações do usuário (member/
// volunteer, via getMyAssignments — mesma fonte da aba Escala) ou da
// congregação (ministry_leader+, via listUpcomingInstances), decidindo a
// fonte por `roles` do token (design.md, Tech Decisions). Toca num item com
// OC leva ao detalhe (`/celebracao/[id]`), passando o ministério da própria
// escala quando a origem for assignment (destaque de "minha função" na
// tela de detalhe, MOB-08-03).
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text } from "react-native";

import { AppLink } from "../../components/AppLink";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { StatusMessage } from "../../components/StatusMessage";
import { decodeJwtPayload } from "../../lib/auth/jwt";
import { useAuth } from "../../lib/auth/auth-provider";
import { getMyAssignments } from "../../lib/escala/escala-client";
import { listUpcomingInstances } from "../../lib/celebracoes/celebracoes-client";
import { spacing, typography } from "../../lib/theme/tokens";

const LEADER_ROLES = [
  "ministry_leader",
  "admin_congregation",
  "pastor",
  "tenant_admin",
  "secretary",
];

const NETWORK_ERROR_MESSAGE = "Não foi possível carregar as celebrações. Verifique sua conexão.";
const EMPTY_VOLUNTEER_MESSAGE = "Você não tem celebrações próximas.";
const EMPTY_LEADER_MESSAGE = "Nenhuma celebração agendada.";

interface CelebracaoListItem {
  id: string;
  celebrationName: string;
  scheduledDate: string;
  serviceOrderId: string | null;
  ministryId?: string;
}

function fromAssignments(
  assignments: Awaited<ReturnType<typeof getMyAssignments>>,
): CelebracaoListItem[] {
  return assignments.map((a) => ({
    id: a.id,
    celebrationName: a.celebration.name,
    scheduledDate: a.scheduled_date,
    serviceOrderId: a.service_order_id,
    ministryId: a.ministry.id,
  }));
}

function fromInstances(
  instances: Awaited<ReturnType<typeof listUpcomingInstances>>,
): CelebracaoListItem[] {
  return instances.map((i) => ({
    id: i.id,
    celebrationName: i.celebration.name,
    scheduledDate: i.scheduled_date,
    serviceOrderId: i.serviceOrder?.id ?? null,
  }));
}

export default function CelebracoesScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const roles = session ? decodeJwtPayload(session.accessToken)?.roles ?? [] : [];
  const isLeader = roles.some((r) => LEADER_ROLES.includes(r));

  const [items, setItems] = useState<CelebracaoListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchItems = isLeader
      ? listUpcomingInstances().then(fromInstances)
      : getMyAssignments().then(fromAssignments);

    fetchItems
      .then((result) => {
        if (cancelled) return;
        setItems(result);
      })
      .catch(() => {
        if (cancelled) return;
        setError(NETWORK_ERROR_MESSAGE);
      });

    return () => {
      cancelled = true;
    };
  }, [isLeader]);

  if (error) {
    return <StatusMessage testID="celebracoes-error" message={error} tone="danger" />;
  }

  if (items && items.length === 0) {
    return (
      <StatusMessage
        testID="celebracoes-empty"
        message={isLeader ? EMPTY_LEADER_MESSAGE : EMPTY_VOLUNTEER_MESSAGE}
      />
    );
  }

  return (
    <Screen>
      <FlatList
        testID="celebracoes-list"
        data={items ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Card testID={`celebracao-${item.id}`}>
            <Text style={typography.subtitle}>{item.celebrationName}</Text>
            {item.serviceOrderId ? (
              <AppLink
                testID={`celebracao-abrir-${item.id}`}
                style={styles.link}
                onPress={() =>
                  router.push(
                    item.ministryId
                      ? `/celebracao/${item.serviceOrderId}?ministryId=${item.ministryId}`
                      : `/celebracao/${item.serviceOrderId}`,
                  )
                }
              >
                Ver Ordem de Culto
              </AppLink>
            ) : null}
          </Card>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  link: {
    marginTop: spacing.xs,
  },
});
