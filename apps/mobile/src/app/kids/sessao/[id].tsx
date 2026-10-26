// Kids — turma da sessão para a equipe (T33, KIDS-09): quem está presente, com
// alergia em destaque, e a entrega da criança digitando o código. O roster não
// traz o código — a equipe o viu no check-in e não o relê (design.md). Código
// errado e pessoa sem permissão caem na MESMA recusa genérica: a tela nunca diz
// qual dos dois falhou nem quem poderia retirar. Esqueceu o código: override do
// líder kids, com motivo gravado.
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { Alert } from "../../../components/Alert";
import { AppButton } from "../../../components/AppButton";
import { Input } from "../../../components/Input";
import { Screen } from "../../../components/Screen";
import { StatusMessage } from "../../../components/StatusMessage";
import { AllergyNote } from "../../../components/kids/AllergyNote";
import { HttpError } from "../../../lib/api/errors";
import { describeLoadError, type LoadErrorState } from "../../../lib/api/load-error";
import { useAuth } from "../../../lib/auth/auth-provider";
import { decodeJwtPayload } from "../../../lib/auth/jwt";
import {
  CHECKOUT_REFUSED_MESSAGE,
  checkOut,
  checkOutOverride,
  describeKidsActionError,
  getRoster,
} from "../../../lib/kids/kids-client";
import type { KidsRoster, KidsRosterItem } from "../../../lib/kids/types";
import { Baby, CircleAlert, WifiOff } from "../../../lib/theme/icons";
import { useTheme } from "../../../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, spacing, typography } from "../../../lib/theme/tokens";

/** Espelho de `KIDS_MANAGE_ROLES` (apps/api/src/kids/kids.roles.ts): só esconde
 * o override de quem não pode — a API é quem nega. */
const OVERRIDE_ROLES = ["tenant_admin", "admin_congregation", "pastor", "secretary", "ministry_leader"];

type Mode = "code" | "override";

export default function SessaoScreen() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [roster, setRoster] = useState<KidsRoster | null>(null);
  const [error, setError] = useState<LoadErrorState | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("code");
  const [code, setCode] = useState("");
  const [pickerName, setPickerName] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const hasDataRef = useRef(false);

  const roles = session ? (decodeJwtPayload(session.accessToken)?.roles ?? []) : [];
  const canOverride = roles.some((r) => OVERRIDE_ROLES.includes(r));

  const load = useCallback(() => {
    let cancelled = false;
    getRoster(id)
      .then((result) => {
        if (cancelled) return;
        hasDataRef.current = true;
        setRoster(result);
        setError(null);
        setForbidden(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof HttpError && err.status === 403) setForbidden(true);
        else if (!hasDataRef.current) setError(describeLoadError(err, "a turma"));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useFocusEffect(load);

  function open(item: KidsRosterItem, nextMode: Mode) {
    setOpenId(item.checkin_id);
    setMode(nextMode);
    setCode("");
    setPickerName("");
    setReason("");
    setRefusal(null);
    setDone(false);
  }

  async function submit(item: KidsRosterItem) {
    setSubmitting(true);
    setRefusal(null);
    try {
      if (mode === "code") {
        await checkOut(item.checkin_id, { code, picked_up_by_name: pickerName });
      } else {
        await checkOutOverride(item.checkin_id, { reason, picked_up_by_name: pickerName });
      }
      setRoster((current) =>
        current
          ? {
              ...current,
              present_count: current.present_count - 1,
              items: current.items.filter((i) => i.checkin_id !== item.checkin_id),
            }
          : current,
      );
      setOpenId(null);
      setDone(true);
    } catch (err) {
      if (mode === "code" && err instanceof HttpError && err.status === 403) {
        setRefusal(CHECKOUT_REFUSED_MESSAGE);
      } else {
        setRefusal(describeKidsActionError(err, "Não foi possível entregar a criança. Tente novamente."));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (forbidden) {
    return (
      <StatusMessage
        testID="sessao-forbidden"
        icon={CircleAlert}
        message="Você não está nesta turma"
        description="Só quem está escalado na turma ou lidera o kids vê as crianças presentes."
      />
    );
  }

  if (error) {
    return (
      <StatusMessage
        testID="sessao-error"
        icon={error.offline ? WifiOff : CircleAlert}
        message={error.message}
        description={error.description}
        tone="danger"
      >
        <AppButton testID="sessao-retry" title="Tentar de novo" variant="secondary" onPress={load} />
      </StatusMessage>
    );
  }

  if (!roster) return <Screen>{null}</Screen>;

  const { capacity } = roster.session.room;

  return (
    <Screen>
      <Text style={[typography.h1, { color: colors.textPrimary }]}>{roster.session.room.name}</Text>
      <Text testID="sessao-contagem" style={[typography.body, styles.count, { color: colors.textSecondary }]}>
        {roster.present_count === 1 ? "1 criança presente" : `${roster.present_count} crianças presentes`}
        {capacity !== null ? ` de ${capacity}` : ""}
      </Text>
      {done ? <Alert tone="success" messageTestID="sessao-entregue" message="Criança entregue" /> : null}

      <FlatList
        testID="sessao-lista"
        data={roster.items}
        keyExtractor={(item) => item.checkin_id}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View testID="sessao-vazia" style={styles.empty}>
            <Baby size={iconSize.emphasis} color={colors.textTertiary} strokeWidth={ICON_STROKE_WIDTH} />
            <Text style={[typography.h3, { color: colors.textPrimary }]}>Nenhuma criança presente</Text>
            <Text style={[typography.body, { color: colors.textSecondary }]}>
              As crianças aparecem aqui assim que o check-in é feito.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View testID={`presente-${item.checkin_id}`} style={[styles.item, { borderBottomColor: colors.border }]}>
            <Text style={[typography.h3, { color: colors.textPrimary }]}>{item.child.full_name}</Text>
            <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>
              Entregue por {item.guardian.full_name}
            </Text>
            {item.has_allergy && item.allergies ? (
              <AllergyNote testID={`presente-${item.checkin_id}-alergia`} allergies={item.allergies} />
            ) : null}

            {openId === item.checkin_id ? (
              <View style={styles.form}>
                {refusal ? <Alert messageTestID="sessao-recusa" message={refusal} /> : null}
                {mode === "code" ? (
                  <Input
                    testID="sessao-codigo"
                    label="Código de retirada"
                    value={code}
                    onChangeText={setCode}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={4}
                  />
                ) : (
                  <Input
                    testID="sessao-motivo"
                    label="Motivo da retirada sem código"
                    value={reason}
                    onChangeText={setReason}
                    multiline
                  />
                )}
                <Input
                  testID="sessao-quem"
                  label="Quem está retirando"
                  value={pickerName}
                  onChangeText={setPickerName}
                  autoCapitalize="words"
                />
                <AppButton
                  testID="sessao-confirmar"
                  title="Entregar criança"
                  loading={submitting}
                  disabled={mode === "code" ? !code.trim() || !pickerName.trim() : reason.trim().length < 5 || !pickerName.trim()}
                  onPress={() => submit(item)}
                />
                {mode === "code" && canOverride ? (
                  <AppButton
                    testID="sessao-override"
                    title="Esqueceu o código? Autorizar sem código"
                    variant="ghost"
                    onPress={() => open(item, "override")}
                  />
                ) : null}
                <AppButton
                  testID="sessao-cancelar"
                  title="Cancelar"
                  variant="ghost"
                  disabled={submitting}
                  onPress={() => setOpenId(null)}
                />
              </View>
            ) : (
              <AppButton
                testID={`presente-${item.checkin_id}-entregar`}
                title="Entregar criança"
                variant="secondary"
                onPress={() => open(item, "code")}
                style={styles.deliver}
              />
            )}
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  count: { marginBottom: spacing.lg },
  empty: { gap: spacing.sm, paddingVertical: spacing.xxxl },
  item: { gap: spacing.xs, paddingVertical: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  deliver: { marginTop: spacing.sm },
  form: { marginTop: spacing.md, gap: spacing.xs },
});
