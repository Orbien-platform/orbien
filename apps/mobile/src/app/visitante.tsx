// Cadastrar visitante (v2, liderança — `VisitanteScreen` em
// docs/design/orbita-v2/produto/proto/app-screens2.jsx).
//
// Nome, telefone e e-mail; a API cria a pessoa como visitante e devolve quem
// já tem o mesmo telefone (ver ./../lib/visitantes/visitantes-client.ts). Se
// houver possível duplicado, a tela mostra os nomes e deixa claro que a
// mesclagem é no painel — o app não mescla pessoa.
//
// Quem chega aqui é quem a aba Mais deixa passar (`VISITOR_WRITE_ROLES`); a
// API recusa os outros com 403 de todo jeito.
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Alert } from "../components/Alert";
import { AppButton } from "../components/AppButton";
import { Card } from "../components/Card";
import { Input } from "../components/Input";
import { Screen } from "../components/Screen";
import { SectionLabel } from "../components/SectionLabel";
import { HttpError, NetworkError } from "../lib/api/errors";
import { CircleCheck, Mail, Phone, UserPlus } from "../lib/theme/icons";
import { useTheme } from "../lib/theme/theme-provider";
import { spacing, typography } from "../lib/theme/tokens";
import {
  registerVisitor,
  type RegisterVisitorResult,
} from "../lib/visitantes/visitantes-client";

function describeSubmitError(error: unknown): string {
  if (error instanceof NetworkError) {
    return "Sem conexão. Os dados continuam aqui — tente de novo quando a conexão voltar.";
  }
  if (error instanceof HttpError && error.status === 403) {
    return "Seu papel não cadastra pessoas. Peça à secretaria da igreja.";
  }
  if (error instanceof HttpError && error.status === 400) {
    return error.message;
  }
  return "Não foi possível cadastrar. Tente de novo em instantes.";
}

export default function VisitanteScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RegisterVisitorResult | null>(null);

  const canSubmit = fullName.trim().length >= 2 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      setResult(await registerVisitor({ full_name: fullName, phone, email }));
    } catch (caught) {
      // Os campos ficam como estavam: quem errou a conexão não redigita nada.
      setError(describeSubmitError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  function startOver() {
    setFullName("");
    setPhone("");
    setEmail("");
    setResult(null);
  }

  if (result) {
    const duplicates = result.possible_duplicates;
    return (
      <Screen scroll testID="visitante-sucesso">
        <Alert
          tone="success"
          icon={CircleCheck}
          messageTestID="visitante-sucesso-msg"
          message={`${result.person.full_name} foi cadastrado como visitante.`}
        />
        {duplicates.length > 0 ? (
          <View testID="visitante-duplicados" style={styles.section}>
            <SectionLabel>Mesmo telefone</SectionLabel>
            <Card>
              <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>
                Já existe na igreja quem use este telefone. Se for a mesma pessoa, a secretaria
                junta os cadastros no painel.
              </Text>
              {duplicates.map((dup) => (
                <Text
                  key={dup.id}
                  style={[typography.h3, styles.duplicate, { color: colors.textPrimary }]}
                >
                  {dup.full_name}
                </Text>
              ))}
            </Card>
          </View>
        ) : null}
        <AppButton
          testID="visitante-outro"
          title="Cadastrar outro visitante"
          icon={UserPlus}
          onPress={startOver}
          style={styles.section}
        />
        <AppButton
          testID="visitante-concluir"
          title="Concluir"
          variant="secondary"
          onPress={() => router.back()}
          style={styles.after}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll testID="visitante-form">
      <Text style={[typography.body, styles.intro, { color: colors.textSecondary }]}>
        Com o telefone, a igreja consegue dar as boas-vindas durante a semana.
      </Text>
      <Input
        testID="visitante-nome"
        label="Nome completo"
        placeholder="Nome e sobrenome"
        value={fullName}
        onChangeText={setFullName}
        autoCapitalize="words"
        autoComplete="name"
        returnKeyType="next"
      />
      <Input
        testID="visitante-telefone"
        label="Telefone"
        icon={Phone}
        placeholder="(11) 99999-0000"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        returnKeyType="next"
      />
      <Input
        testID="visitante-email"
        label="E-mail (opcional)"
        icon={Mail}
        placeholder="nome@exemplo.com"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
      />
      {error ? <Alert messageTestID="visitante-erro" message={error} /> : null}
      <AppButton
        testID="visitante-enviar"
        title="Cadastrar visitante"
        icon={UserPlus}
        onPress={handleSubmit}
        loading={submitting}
        disabled={!canSubmit}
        style={styles.after}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { marginBottom: spacing.lg },
  section: { marginTop: spacing.lg },
  after: { marginTop: spacing.sm },
  duplicate: { marginTop: spacing.sm },
});
