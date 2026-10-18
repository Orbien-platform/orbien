// Contagem de público do culto, dentro do card da escala (Minhas escalas).
//
// Aparece só para quem está escalado num ministério responsável pela contagem
// (`can_count_attendance`). Fechado, é um botão que diz o que há — "Contar
// público" ou o total já lançado; aberto, são as quatro categorias, que não se
// sobrepõem, e o total somado ao vivo. Quem decide se pode salvar (dia do culto,
// culto cancelado, permissão) é a API, e a mensagem dela chega aqui.
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { HttpError } from "../../lib/api/errors";
import { saveAttendance } from "../../lib/escala/escala-client";
import type { AttendanceCounts } from "../../lib/escala/types";
import { Users } from "../../lib/theme/icons";
import { useTheme } from "../../lib/theme/theme-provider";
import { spacing, typography } from "../../lib/theme/tokens";
import { Alert } from "../Alert";
import { AppButton } from "../AppButton";
import { Input } from "../Input";

const MAX = 100000;
const GENERIC_ERROR = "Não foi possível salvar a contagem. Tente novamente.";

type Field = "children" | "members" | "attendees" | "visitors";

const FIELDS: { key: Field; label: string }[] = [
  { key: "children", label: "Crianças" },
  { key: "members", label: "Membros" },
  { key: "attendees", label: "Frequentadores" },
  { key: "visitors", label: "Visitantes" },
];

function parse(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const n = Number(value);
  return n <= MAX ? n : null;
}

interface AttendanceCountPanelProps {
  instanceId: string;
  /** Prefixo dos testIDs — o id da escala. */
  idPrefix: string;
  attendance: AttendanceCounts | null | undefined;
  onSaved: (counts: AttendanceCounts) => void;
}

export function AttendanceCountPanel({
  instanceId,
  idPrefix,
  attendance,
  onSaved,
}: AttendanceCountPanelProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<Field, string>>({
    children: attendance ? String(attendance.children) : "",
    members: attendance ? String(attendance.members) : "",
    attendees: attendance ? String(attendance.attendees) : "",
    visitors: attendance ? String(attendance.visitors) : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = FIELDS.map((f) => parse(values[f.key]));
  const valid = parsed.every((n) => n !== null);
  const total = parsed.reduce<number>((sum, n) => sum + (n ?? 0), 0);

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveAttendance(instanceId, {
        children: parsed[0] as number,
        members: parsed[1] as number,
        attendees: parsed[2] as number,
        visitors: parsed[3] as number,
      });
      onSaved(saved);
      setOpen(false);
    } catch (err) {
      // Só a mensagem de erro de cliente (4xx) é escrita para a pessoa ler;
      // de 5xx para cima o corpo é técnico.
      setError(err instanceof HttpError && err.status < 500 ? err.message : GENERIC_ERROR);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <AppButton
        testID={`${idPrefix}-attendance-open`}
        title={attendance ? `Contagem lançada: ${attendance.total}` : "Contar público"}
        variant={attendance ? "secondary" : "primary"}
        icon={Users}
        onPress={() => setOpen(true)}
        style={styles.open}
      />
    );
  }

  return (
    <View testID={`${idPrefix}-attendance-form`} style={styles.form}>
      <Text style={[typography.label, { color: colors.textTertiary }]}>Contagem do culto</Text>
      {FIELDS.map((f) => (
        <Input
          key={f.key}
          testID={`${idPrefix}-attendance-${f.key}`}
          label={f.label}
          value={values[f.key]}
          onChangeText={(text) => setValues((v) => ({ ...v, [f.key]: text }))}
          keyboardType="number-pad"
          editable={!saving}
          accessibilityLabel={f.label}
        />
      ))}
      <View style={styles.totalRow}>
        <Text style={[typography.body, { color: colors.textSecondary }]}>Total</Text>
        <Text
          testID={`${idPrefix}-attendance-total`}
          style={[typography.mono, { color: colors.textPrimary }]}
        >
          {total}
        </Text>
      </View>
      {error ? <Alert messageTestID={`${idPrefix}-attendance-error`} message={error} /> : null}
      <View style={styles.actions}>
        <AppButton
          testID={`${idPrefix}-attendance-cancel`}
          title="Voltar"
          variant="secondary"
          disabled={saving}
          onPress={() => setOpen(false)}
          style={styles.action}
        />
        <AppButton
          testID={`${idPrefix}-attendance-save`}
          title="Salvar contagem"
          loading={saving}
          disabled={!valid}
          onPress={save}
          style={styles.action}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  open: { marginTop: spacing.lg },
  form: { marginTop: spacing.lg, gap: spacing.md },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: { flex: 1 },
});
