// Novo QR de autocadastro: culto, grupo, evento ou outro, com nome opcional
// (`POST /admin/visitor/qr`). Origem "Grupo" pede o grupo, como no painel web
// (`/pessoas/qr-visitantes`). Criado, abre direto o QR em tela cheia.
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Alert } from "../components/Alert";
import { AppButton } from "../components/AppButton";
import { ChoiceChips } from "../components/ChoiceChips";
import { Input } from "../components/Input";
import { Screen } from "../components/Screen";
import { useTheme } from "../lib/theme/theme-provider";
import { spacing, typography } from "../lib/theme/tokens";
import {
  createSignupQr,
  listGroupOptions,
  ORIGIN_LABELS,
  type GroupOption,
  type VisitOrigin,
} from "../lib/visitantes/visitantes-client";

const ORIGINS = (Object.keys(ORIGIN_LABELS) as VisitOrigin[]).map((value) => ({
  value,
  label: ORIGIN_LABELS[value],
}));

export default function AutocadastroNovoScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [origin, setOrigin] = useState<VisitOrigin>("service");
  const [label, setLabel] = useState("");
  const [groups, setGroups] = useState<GroupOption[] | null>(null);
  const [groupsFailed, setGroupsFailed] = useState(false);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const savingRef = useRef(false);

  const needsGroup = origin === "small_group";

  useEffect(() => {
    if (!needsGroup || groups !== null) return;
    let cancelled = false;
    listGroupOptions()
      .then((list) => {
        if (!cancelled) setGroups(list);
      })
      .catch(() => {
        if (!cancelled) setGroupsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [needsGroup, groups]);

  const canSave = !saving && (!needsGroup || groupId !== null);

  async function submit() {
    if (!canSave || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(false);
    try {
      const created = await createSignupQr(origin, label, needsGroup ? groupId ?? undefined : undefined);
      const groupName = groups?.find((g) => g.id === groupId)?.name;
      // Troca a tela: voltar do QR em tela cheia cai na lista, não no formulário.
      router.replace({
        pathname: "/autocadastro-qr",
        params: {
          token: created.token,
          title: created.label?.trim() || groupName || ORIGIN_LABELS[created.origin],
        },
      });
    } catch {
      setError(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Screen scroll testID="autocadastro-novo-form">
      <Text style={[typography.label, styles.fieldLabel, { color: colors.textTertiary }]}>
        Onde ele vai ficar
      </Text>
      <ChoiceChips
        testID="novo-origem"
        options={ORIGINS}
        value={origin}
        onChange={(value) => {
          setOrigin(value);
          setGroupId(null);
        }}
        accessibilityLabel="Onde o QR vai ficar"
      />

      {needsGroup ? (
        <View style={styles.block}>
          <Text style={[typography.label, styles.fieldLabel, { color: colors.textTertiary }]}>
            Grupo
          </Text>
          {groupsFailed ? (
            <Alert messageTestID="novo-grupos-erro" message="Não foi possível carregar os grupos." />
          ) : groups === null ? (
            <Text style={[typography.body, { color: colors.textSecondary }]}>Carregando grupos…</Text>
          ) : groups.length === 0 ? (
            <Text style={[typography.body, { color: colors.textSecondary }]}>
              A igreja ainda não tem grupos.
            </Text>
          ) : (
            <ChoiceChips
              testID="novo-grupo"
              options={groups.map((g) => ({ value: g.id, label: g.name }))}
              value={groupId}
              onChange={setGroupId}
              accessibilityLabel="Grupo do QR"
            />
          )}
        </View>
      ) : null}

      <View style={styles.block}>
        <Input
          testID="novo-nome"
          label="Nome (opcional)"
          value={label}
          maxLength={80}
          onChangeText={setLabel}
          placeholder="Culto de domingo à noite"
        />
        <Text style={[typography.caption, { color: colors.textTertiary }]}>
          O visitante vê este nome no topo do cadastro.
        </Text>
      </View>

      {error ? (
        <Alert messageTestID="novo-erro" message="Não foi possível criar o QR. Tente de novo." />
      ) : null}
      <AppButton testID="novo-criar" title="Criar QR" disabled={!canSave} loading={saving} onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { marginBottom: spacing.sm },
  block: { marginTop: spacing.xl, marginBottom: spacing.md },
});
