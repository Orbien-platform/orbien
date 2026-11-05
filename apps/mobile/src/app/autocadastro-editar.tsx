// Gerenciar um QR de autocadastro: mostrar em tela cheia, renomear e
// ligar/desligar (`PATCH /admin/visitor/qr/:id`). O endereço do QR não muda
// em nenhuma dessas ações — o QR já impresso continua valendo. Mesmo desenho
// e mesmos papéis do painel web (`/pessoas/qr-visitantes`).
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Alert } from "../components/Alert";
import { AppButton } from "../components/AppButton";
import { Input } from "../components/Input";
import { Screen } from "../components/Screen";
import { updateSignupQr, ORIGIN_LABELS, type VisitOrigin } from "../lib/visitantes/visitantes-client";
import { useTheme } from "../lib/theme/theme-provider";
import { QrCode } from "../lib/theme/icons";
import { spacing, typography } from "../lib/theme/tokens";

const LABEL_MAX = 80;

export default function AutocadastroEditarScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{
    id: string;
    token: string;
    origin: VisitOrigin;
    label?: string;
    active?: string;
    scans?: string;
  }>();

  const [label, setLabel] = useState(params.label ?? "");
  const [savedLabel, setSavedLabel] = useState(params.label ?? "");
  const [isActive, setIsActive] = useState(params.active !== "0");
  const [busy, setBusy] = useState<"label" | "active" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busyRef = useRef(false);

  const origin = ORIGIN_LABELS[params.origin] ?? ORIGIN_LABELS.other;
  const title = savedLabel.trim() || origin;
  const dirty = label.trim() !== savedLabel.trim();

  async function run(kind: "label" | "active", patch: { label?: string; is_active?: boolean }) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      const updated = await updateSignupQr(params.id, patch);
      setSavedLabel(updated.label ?? "");
      setLabel(updated.label ?? "");
      setIsActive(updated.is_active);
      setNotice(kind === "label" ? "Nome salvo." : updated.is_active ? "QR reativado." : "QR desativado.");
    } catch {
      setError("Não foi possível salvar. Tente de novo.");
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  function show() {
    router.push({ pathname: "/autocadastro-qr", params: { token: params.token, title } });
  }

  return (
    <Screen scroll testID="autocadastro-editar">
      <Text style={[typography.h3, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[typography.caption, styles.meta, { color: colors.textTertiary }]}>
        {origin} · {isActive ? "Ativo" : "Desativado"} · {params.scans ?? "0"} cadastros
      </Text>

      {isActive ? (
        <AppButton testID="editar-mostrar" title="Mostrar QR" icon={QrCode} onPress={show} />
      ) : (
        <Text style={[typography.body, { color: colors.textSecondary }]}>
          Este QR está desativado e não recebe cadastros. Reative para projetar.
        </Text>
      )}

      <View style={styles.section}>
        <Input
          testID="editar-nome"
          label="Nome"
          value={label}
          maxLength={LABEL_MAX}
          onChangeText={setLabel}
          placeholder="Culto de domingo à noite"
        />
        <Text style={[typography.caption, styles.hint, { color: colors.textTertiary }]}>
          O QR impresso continua valendo: só o nome muda, o endereço é o mesmo.
        </Text>
        <AppButton
          testID="editar-salvar"
          title="Salvar nome"
          variant="secondary"
          disabled={!dirty}
          loading={busy === "label"}
          onPress={() => run("label", { label: label.trim() })}
        />
      </View>

      {error ? <Alert messageTestID="editar-erro" message={error} /> : null}
      {notice ? <Alert messageTestID="editar-aviso" tone="success" message={notice} /> : null}

      <View style={styles.section}>
        <AppButton
          testID="editar-alternar"
          title={isActive ? "Desativar QR" : "Reativar QR"}
          variant={isActive ? "danger" : "primary"}
          loading={busy === "active"}
          onPress={() => run("active", { is_active: !isActive })}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { marginTop: spacing.xs, marginBottom: spacing.xl },
  section: { marginTop: spacing.xl, gap: spacing.md },
  hint: { marginTop: -spacing.xs },
});
