// Kids — ficha do filho (T31/T32, KIDS-04/05/07): idade, alergia em destaque,
// autorizados para retirada (editar, remover, adicionar) e o código do
// check-in aberto. Havendo sessão kids aberta hoje, a ação fixa do
// rodapé é "Fazer check-in".
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { Alert } from "../../../components/Alert";
import { AppButton } from "../../../components/AppButton";
import { Badge } from "../../../components/Badge";
import { Screen } from "../../../components/Screen";
import { SectionLabel } from "../../../components/SectionLabel";
import { StatusMessage } from "../../../components/StatusMessage";
import { AllergyNote } from "../../../components/kids/AllergyNote";
import { describeLoadError, type LoadErrorState } from "../../../lib/api/load-error";
import {
  ageInMonths,
  describeKidsActionError,
  formatAge,
  getChild,
  getOpenCheckin,
  listOpenSessions,
  removeGuardian,
  updateGuardian,
} from "../../../lib/kids/kids-client";
import type { KidsChildFicha, KidsGuardian, KidsOpenCheckin } from "../../../lib/kids/types";
import { CircleAlert, Plus, QrCode, Trash, WifiOff } from "../../../lib/theme/icons";
import { useTheme } from "../../../lib/theme/theme-provider";
import { spacing, touchTarget, typography } from "../../../lib/theme/tokens";

export default function CriancaScreen() {
  const router = useRouter();
  const { colors, primaryColor } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [child, setChild] = useState<KidsChildFicha | null>(null);
  const [open, setOpen] = useState<KidsOpenCheckin | null>(null);
  const [hasOpenSession, setHasOpenSession] = useState(false);
  const [error, setError] = useState<LoadErrorState | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const hasDataRef = useRef(false);

  const load = useCallback(() => {
    let cancelled = false;
    Promise.all([
      getChild(id),
      getOpenCheckin(id).catch(() => null),
      // Só decide se o botão aparece; falhar aqui não derruba a ficha.
      listOpenSessions().catch(() => []),
    ])
      .then(([ficha, checkin, sessions]) => {
        if (cancelled) return;
        hasDataRef.current = true;
        setError(null);
        setChild(ficha);
        setOpen(checkin);
        setHasOpenSession(sessions.length > 0);
      })
      .catch((err: unknown) => {
        if (!cancelled && !hasDataRef.current) setError(describeLoadError(err, "a ficha da criança"));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useFocusEffect(load);

  async function change(guardian: KidsGuardian, action: () => Promise<unknown>, fallback: string) {
    setBusyId(guardian.id);
    setActionError(null);
    try {
      await action();
      load();
    } catch (err) {
      setActionError(describeKidsActionError(err, fallback));
    } finally {
      setBusyId(null);
    }
  }

  if (error) {
    return (
      <StatusMessage
        testID="crianca-error"
        icon={error.offline ? WifiOff : CircleAlert}
        message={error.message}
        description={error.description}
        tone="danger"
      >
        <AppButton testID="crianca-retry" title="Tentar de novo" variant="secondary" onPress={load} />
      </StatusMessage>
    );
  }

  if (!child) return <Screen>{null}</Screen>;

  const months = child.birth_date ? ageInMonths(child.birth_date) : null;
  const showCheckin = !open && hasOpenSession;

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.body}>
        <Text style={[typography.h1, { color: colors.textPrimary }]}>{child.full_name}</Text>
        {months !== null ? (
          <Text style={[typography.body, styles.age, { color: colors.textSecondary }]}>{formatAge(months)}</Text>
        ) : null}

        {child.allergies ? <AllergyNote testID="crianca-alergia" allergies={child.allergies} /> : null}
        {child.medical_notes ? (
          <Text testID="crianca-observacao" style={[typography.body, styles.notes, { color: colors.textSecondary }]}>
            Observação: {child.medical_notes}
          </Text>
        ) : null}

        {open ? (
          <Text testID="crianca-presente" style={[typography.bodyMedium, styles.notes, { color: colors.success }]}>
            Check-in feito na turma {open.room.name}.
          </Text>
        ) : null}

        {actionError ? <Alert messageTestID="crianca-action-error" message={actionError} /> : null}

        <SectionLabel>Autorizados para retirada</SectionLabel>
        {child.guardians.map((g) => (
          <View key={g.id} testID={`autorizado-${g.id}`} style={[styles.guardian, { borderBottomColor: colors.border }]}>
            <View style={styles.guardianHead}>
              <View style={styles.guardianName}>
                <Text style={[typography.h3, { color: colors.textPrimary }]}>{g.full_name}</Text>
                <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>{g.relationship}</Text>
              </View>
              {g.is_primary ? <Badge label="Principal" tone="info" /> : null}
            </View>
            <View style={styles.switchRow}>
              <Text style={[typography.body, { color: colors.textPrimary }]}>Pode retirar</Text>
              <Switch
                testID={`autorizado-${g.id}-retirar`}
                value={g.can_pickup}
                disabled={busyId !== null}
                onValueChange={(value) =>
                  change(g, () => updateGuardian(g.id, { can_pickup: value }), "Não foi possível salvar. Tente novamente.")
                }
                trackColor={{ false: colors.border, true: primaryColor }}
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={[typography.body, { color: colors.textPrimary }]}>Responsável principal</Text>
              <Switch
                testID={`autorizado-${g.id}-principal`}
                value={g.is_primary}
                disabled={busyId !== null}
                onValueChange={(value) =>
                  change(g, () => updateGuardian(g.id, { is_primary: value }), "Não foi possível salvar. Tente novamente.")
                }
                trackColor={{ false: colors.border, true: primaryColor }}
              />
            </View>
            <AppButton
              testID={`autorizado-${g.id}-remover`}
              title="Remover autorizado"
              variant="ghost"
              icon={Trash}
              disabled={busyId !== null}
              onPress={() => change(g, () => removeGuardian(g.id), "Não foi possível remover. Tente novamente.")}
            />
          </View>
        ))}
        <AppButton
          testID="autorizado-adicionar"
          title="Adicionar autorizado"
          variant="secondary"
          icon={Plus}
          onPress={() => router.push({ pathname: "/kids/crianca/[id]/autorizado", params: { id } })}
          style={styles.add}
        />
      </ScrollView>

      {open ? (
        <AppButton
          testID="crianca-codigo"
          title="Ver código de retirada"
          onPress={() => router.push({ pathname: "/kids/codigo/[id]", params: { id } })}
          style={styles.footer}
        />
      ) : null}
      {showCheckin ? (
        <>
          <AppButton
            testID="crianca-checkin"
            title="Fazer check-in"
            onPress={() => router.push({ pathname: "/kids/checkin/[childId]", params: { childId: id } })}
            style={styles.footer}
          />
          <AppButton
            testID="crianca-qr"
            title="Mostrar QR para o check-in"
            variant="secondary"
            icon={QrCode}
            onPress={() => router.push({ pathname: "/kids/qr/[childId]", params: { childId: id } })}
            style={styles.footer}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  age: { marginBottom: spacing.lg },
  notes: { marginTop: spacing.md },
  guardian: { gap: spacing.xs, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  guardianHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  guardianName: { flex: 1 },
  switchRow: {
    minHeight: touchTarget,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  add: { marginTop: spacing.lg },
  footer: { marginTop: spacing.md },
});
