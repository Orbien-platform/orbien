// Kids — adicionar autorizado para retirada (T31, KIDS-05): terceiro sem
// conta (avó, vizinha) com nome, telefone e parentesco. A criança sempre
// mantém ao menos um responsável principal — quem garante é a API.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { Alert } from "../../../../components/Alert";
import { AppButton } from "../../../../components/AppButton";
import { Input } from "../../../../components/Input";
import { Screen } from "../../../../components/Screen";
import { addGuardian, describeKidsActionError } from "../../../../lib/kids/kids-client";
import { isValidPhone, maskPhone } from "../../../../lib/format/profile-input";
import { useTheme } from "../../../../lib/theme/theme-provider";
import { spacing, touchTarget, typography } from "../../../../lib/theme/tokens";

export default function AutorizadoScreen() {
  const router = useRouter();
  const { colors, primaryColor } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState("");
  const [canPickup, setCanPickup] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (submitting) return;
    if (!name.trim()) return setError("Informe o nome de quem vai buscar.");
    if (!isValidPhone(phone)) return setError("Informe o telefone com DDD.");
    if (!relationship.trim()) return setError("Informe o parentesco (avó, tio, vizinha...).");
    setSubmitting(true);
    setError(null);
    try {
      await addGuardian(id, {
        full_name: name.trim(),
        phone: phone.replace(/\D/g, ""),
        relationship: relationship.trim(),
        can_pickup: canPickup,
      });
      router.back();
    } catch (err) {
      setError(describeKidsActionError(err, "Não foi possível adicionar. Tente novamente."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.form}>
        {error ? <Alert messageTestID="autorizado-error" message={error} /> : null}
        <Input testID="autorizado-nome" label="Nome" value={name} onChangeText={setName} autoCapitalize="words" />
        <Input
          testID="autorizado-telefone"
          label="Telefone"
          value={phone}
          onChangeText={(v) => setPhone(maskPhone(v))}
          keyboardType="phone-pad"
        />
        <Input
          testID="autorizado-parentesco"
          label="Parentesco"
          value={relationship}
          onChangeText={setRelationship}
          placeholder="Ex.: avó"
        />
        <View style={styles.switchRow}>
          <Text style={[typography.body, { color: colors.textPrimary }]}>Pode retirar a criança</Text>
          <Switch
            testID="autorizado-pode-retirar"
            value={canPickup}
            onValueChange={setCanPickup}
            trackColor={{ false: colors.border, true: primaryColor }}
          />
        </View>
      </ScrollView>
      <AppButton testID="autorizado-salvar" title="Adicionar autorizado" loading={submitting} onPress={submit} style={styles.footer} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { flex: 1 },
  switchRow: {
    minHeight: touchTarget,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footer: { marginTop: spacing.md },
});
