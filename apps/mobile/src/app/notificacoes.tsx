// Tela Notificações (MOB-10a/MOB-10b) — 4 toggles de categoria de push.
// Rota solta, como indisponibilidade.tsx, acessada a partir de Perfil.
//
// GET no mount (sem preferência salva, o servidor já devolve as 4 ligadas
// — AC1). Toggle: atualização otimista + PATCH da categoria isolada;
// sucesso sincroniza as tags OneSignal com o estado completo devolvido
// (AC1 da história "disparo respeita a categoria"); falha reverte o
// toggle e mostra erro, nunca deixando a UI mostrar "desligado" enquanto
// o servidor ainda registra "ligado" (AC3).
//
// Escritas são serializadas por categoria, não globalmente (Edge Case da
// spec): cada categoria mantém sua própria cadeia de promises
// (`pendingRef`), então desligar duas categorias em sequência não faz uma
// esperar a resposta da outra — só a segunda escrita da MESMA categoria
// espera a primeira terminar, para a última tocada não perder para uma
// resposta atrasada.
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";

import { Alert } from "../components/Alert";
import { Card } from "../components/Card";
import { Screen } from "../components/Screen";
import { describeLoadError } from "../lib/api/load-error";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferenceValues,
} from "../lib/notifications/notification-preferences-client";
import { syncNotificationPreferenceTags } from "../lib/notifications/onesignal-client";
import { useTheme } from "../lib/theme/theme-provider";
import { spacing, touchTarget, typography } from "../lib/theme/tokens";

type Category = keyof NotificationPreferenceValues;

const CATEGORY_LABELS: Record<Category, string> = {
  avisos: "Avisos",
  oracao: "Pedidos de oração",
  eventos: "Eventos",
  devocional: "Conteúdo devocional",
};

const CATEGORY_ORDER: Category[] = ["avisos", "oracao", "eventos", "devocional"];

const DEFAULT_PREFS: NotificationPreferenceValues = {
  avisos: true,
  oracao: true,
  eventos: true,
  devocional: true,
};

const SAVE_ERROR_MESSAGE = "Não foi possível salvar. Tente novamente.";

export default function NotificacoesScreen() {
  const { primaryColor, colors } = useTheme();
  const [prefs, setPrefs] = useState<NotificationPreferenceValues>(DEFAULT_PREFS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Uma cadeia de promises por categoria — chave da serialização "por
  // categoria, não global" do Edge Case da spec.
  const pendingRef = useRef<Partial<Record<Category, Promise<unknown>>>>({});

  useEffect(() => {
    const signal = { cancelled: false };
    getNotificationPreferences()
      .then((result) => {
        if (signal.cancelled) return;
        setPrefs(result);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (signal.cancelled) return;
        setLoadError(describeLoadError(err, "suas preferências de notificação").message);
      });
    return () => {
      signal.cancelled = true;
    };
  }, []);

  function handleToggle(category: Category, value: boolean) {
    const previousValue = prefs[category];
    setSaveError(null);
    setPrefs((prev) => ({ ...prev, [category]: value }));

    const chain = (pendingRef.current[category] ?? Promise.resolve()).then(() =>
      updateNotificationPreferences({ [category]: value }),
    );
    pendingRef.current[category] = chain;

    chain
      .then((result) => {
        // Só aplica se ainda for a escrita mais recente desta categoria —
        // uma escrita anterior atrasada não pode sobrescrever a última.
        if (pendingRef.current[category] !== chain) return;
        setPrefs(result as NotificationPreferenceValues);
        syncNotificationPreferenceTags(result as NotificationPreferenceValues);
      })
      .catch(() => {
        if (pendingRef.current[category] !== chain) return;
        setPrefs((prev) => ({ ...prev, [category]: previousValue }));
        setSaveError(SAVE_ERROR_MESSAGE);
      });
  }

  return (
    <Screen scroll>
      <Card>
        {CATEGORY_ORDER.map((category, index) => (
          <View
            key={category}
            style={[styles.row, index > 0 ? { borderTopColor: colors.border, borderTopWidth: 1 } : null]}
          >
            <Text style={[typography.bodyMedium, styles.label, { color: colors.textPrimary }]}>
              {CATEGORY_LABELS[category]}
            </Text>
            <Switch
              testID={`switch-${category}`}
              value={prefs[category]}
              onValueChange={(value) => handleToggle(category, value)}
              trackColor={{ false: colors.border, true: primaryColor }}
            />
          </View>
        ))}
      </Card>

      {loadError ? <Alert messageTestID="load-error" message={loadError} /> : null}
      {saveError ? <Alert messageTestID="save-error" message={saveError} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: touchTarget,
    paddingVertical: spacing.sm,
  },
  label: { flex: 1, marginRight: spacing.md },
});
