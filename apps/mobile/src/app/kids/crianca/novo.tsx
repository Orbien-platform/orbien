// Kids — cadastro de criança (T31, KIDS-04/06). Sem consentimento vigente o
// termo vem antes do formulário; a API é quem recusa de verdade (422
// `kids_consent_required`), e a tela volta ao termo se isso acontecer.
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";

import { Alert } from "../../../components/Alert";
import { AppButton } from "../../../components/AppButton";
import { Input } from "../../../components/Input";
import { Screen } from "../../../components/Screen";
import { StatusMessage } from "../../../components/StatusMessage";
import { ConsentTerm } from "../../../components/kids/ConsentTerm";
import { describeLoadError, type LoadErrorState } from "../../../lib/api/load-error";
import { createChild, describeKidsActionError, getConsentStatus, kidsErrorCode } from "../../../lib/kids/kids-client";
import type { KidsConsentStatus } from "../../../lib/kids/types";
import { maskBirthDate, parseBirthDate } from "../../../lib/format/profile-input";
import { CircleAlert, WifiOff } from "../../../lib/theme/icons";
import { useTheme } from "../../../lib/theme/theme-provider";
import { spacing, typography } from "../../../lib/theme/tokens";

export default function NovaCriancaScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [consent, setConsent] = useState<KidsConsentStatus | null>(null);
  const [loadError, setLoadError] = useState<LoadErrorState | null>(null);
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [allergies, setAllergies] = useState("");
  const [notes, setNotes] = useState("");
  const [relationship, setRelationship] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConsent = useCallback(() => {
    getConsentStatus()
      .then((result) => {
        setConsent(result);
        setLoadError(null);
      })
      .catch((err: unknown) => setLoadError(describeLoadError(err, "o termo de consentimento")));
  }, []);

  useEffect(loadConsent, [loadConsent]);

  async function submit() {
    const birthIso = parseBirthDate(birth);
    if (!name.trim()) return setError("Informe o nome da criança.");
    if (!birthIso) return setError("Informe a data de nascimento no formato DD/MM/AAAA.");
    setSubmitting(true);
    setError(null);
    try {
      const child = await createChild({
        full_name: name.trim(),
        birth_date: birthIso,
        ...(allergies.trim() ? { allergies: allergies.trim() } : {}),
        ...(notes.trim() ? { medical_notes: notes.trim() } : {}),
        ...(relationship.trim() ? { relationship: relationship.trim() } : {}),
      });
      router.replace({ pathname: "/kids/crianca/[id]", params: { id: child.id } });
    } catch (err) {
      if (kidsErrorCode(err) === "kids_consent_required") loadConsent();
      setError(describeKidsActionError(err, "Não foi possível cadastrar a criança. Tente novamente."));
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <StatusMessage
        testID="nova-error"
        icon={loadError.offline ? WifiOff : CircleAlert}
        message={loadError.message}
        description={loadError.description}
        tone="danger"
      >
        <AppButton testID="nova-retry" title="Tentar de novo" variant="secondary" onPress={loadConsent} />
      </StatusMessage>
    );
  }

  if (!consent) return <Screen>{null}</Screen>;

  if (!consent.valid) {
    return (
      <Screen scroll>
        <Text testID="nova-consent-intro" style={[typography.h2, styles.title, { color: colors.textPrimary }]}>
          Antes de cadastrar, leia o termo
        </Text>
        <ConsentTerm status={consent} onChanged={loadConsent} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.form}>
        {error ? <Alert messageTestID="nova-form-error" message={error} /> : null}
        <Input testID="nova-nome" label="Nome da criança" value={name} onChangeText={setName} autoCapitalize="words" />
        <Input
          testID="nova-nascimento"
          label="Data de nascimento"
          value={birth}
          onChangeText={(v) => setBirth(maskBirthDate(v))}
          keyboardType="number-pad"
          placeholder="DD/MM/AAAA"
        />
        <Input
          testID="nova-alergia"
          label="Alergia (opcional)"
          value={allergies}
          onChangeText={setAllergies}
          placeholder="Ex.: amendoim"
        />
        <Input
          testID="nova-observacao"
          label="Observação de saúde (opcional)"
          value={notes}
          onChangeText={setNotes}
          multiline
        />
        <Input
          testID="nova-parentesco"
          label="Seu parentesco (opcional)"
          value={relationship}
          onChangeText={setRelationship}
          placeholder="Ex.: mãe"
        />
      </ScrollView>
      <AppButton testID="nova-salvar" title="Cadastrar criança" loading={submitting} onPress={submit} style={styles.footer} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.lg },
  form: { flex: 1 },
  footer: { marginTop: spacing.md },
});
