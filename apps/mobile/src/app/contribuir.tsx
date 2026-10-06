// Contribuir (PROD-31, v2 — `ContribuirScreen` em
// docs/design/orbita-v2/produto/proto/): escolher a categoria, doar anônima ou
// identificada e pagar por PIX. Esta versão é a do Starter: a tela devolve a
// chave (ou o copia-e-cola) para colar no app do banco, e o tesoureiro baixa o
// recebimento. QR dinâmico e recorrente seguem atrás de `ASAAS_PAYMENTS_ENABLED`
// (PROD-28) e não entram aqui.
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";

import { Alert } from "../components/Alert";
import { AppButton } from "../components/AppButton";
import { Card } from "../components/Card";
import { ChoiceChips, type Choice } from "../components/ChoiceChips";
import { Input } from "../components/Input";
import { Screen } from "../components/Screen";
import { SectionLabel } from "../components/SectionLabel";
import { StatusMessage } from "../components/StatusMessage";
import { HttpError, NetworkError } from "../lib/api/errors";
import {
  DONATION_CATEGORIES,
  MAX_AMOUNT,
  MIN_AMOUNT,
  createDonation,
  pixCodeToCopy,
  type DonationCategory,
  type DonationResult,
} from "../lib/contribuir/contribuir-client";
import { formatBRL } from "../lib/format/currency";
import { parseAmount } from "../lib/pix-recorrente/pix-recorrente-client";
import { Copy, HandHeart } from "../lib/theme/icons";
import { useTheme } from "../lib/theme/theme-provider";
import { spacing, typography } from "../lib/theme/tokens";

type Identity = "anonymous" | "named";

const CATEGORY_OPTIONS: Choice<DonationCategory>[] = DONATION_CATEGORIES.map(({ value, label }) => ({
  value,
  label,
}));
const IDENTITY_OPTIONS: Choice<Identity>[] = [
  { value: "anonymous", label: "Anônima" },
  { value: "named", label: "Identificada" },
];

function describeError(error: unknown): string {
  if (error instanceof NetworkError) {
    return "Sem conexão. Os dados continuam aqui — tente de novo quando a conexão voltar.";
  }
  if (error instanceof HttpError) {
    // A API responde 404 tanto para igreja desconhecida quanto para igreja sem
    // chave PIX cadastrada — sair e entrar de novo não resolve nenhum dos dois.
    if (error.status === 404) {
      return "Sua igreja ainda não tem uma chave PIX cadastrada. Fale com a secretaria.";
    }
    if (error.status === 429) return "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.";
    if (error.status === 400) return error.message;
  }
  return "Não foi possível gerar a contribuição agora. Tente de novo em instantes.";
}

export default function ContribuirScreen() {
  const router = useRouter();
  const { colors, tenantSlug } = useTheme();
  const [category, setCategory] = useState<DonationCategory>("dizimo");
  const [identity, setIdentity] = useState<Identity>("anonymous");
  const [amountText, setAmountText] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DonationResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const amount = parseAmount(amountText);
  const amountInvalid =
    amountText.trim() !== "" && (amount === null || amount < MIN_AMOUNT || amount > MAX_AMOUNT);
  // Identificada sem nome sairia anônima (o cliente descarta o nome vazio), então
  // o botão só habilita com o nome preenchido.
  const nameMissing = identity === "named" && name.trim() === "";
  const canSubmit = !!tenantSlug && amount !== null && !amountInvalid && !nameMissing && !submitting;

  async function submit() {
    if (!tenantSlug || amount === null) return;
    setError(null);
    setSubmitting(true);
    try {
      setResult(
        await createDonation({
          tenantSlug,
          amount,
          category,
          donorName: identity === "named" ? name : undefined,
        }),
      );
    } catch (caught) {
      // Valor e categoria ficam como estavam: quem perdeu a conexão não redigita.
      setError(describeError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  async function copy(code: string) {
    setCopyError(null);
    try {
      await Clipboard.setStringAsync(code);
      setCopied(true);
    } catch {
      setCopied(false);
      setCopyError("Não foi possível copiar. Selecione o código abaixo.");
    }
  }

  function startOver() {
    setResult(null);
    setAmountText("");
    setCopied(false);
    setCopyError(null);
  }

  if (result) {
    const code = pixCodeToCopy(result);
    return (
      <Screen scroll testID="contribuir-resultado">
        <Card>
          <Text style={[typography.label, { color: colors.textTertiary }]}>{result.church_name}</Text>
          <Text testID="contribuir-valor" style={[typography.display, { color: colors.textPrimary }]}>
            {formatBRL(result.amount)}
          </Text>
          <Text style={[typography.body, styles.intro, { color: colors.textSecondary }]}>
            Copie o código, abra o app do seu banco e pague por PIX com a opção copia e cola. A igreja
            confirma o recebimento depois.
          </Text>
          <Text
            testID="contribuir-codigo"
            selectable
            style={[typography.bodyMedium, styles.code, { color: colors.textPrimary, backgroundColor: colors.bgSubtle }]}
          >
            {code}
          </Text>
          {copyError ? <Alert messageTestID="contribuir-copy-erro" message={copyError} /> : null}
          <AppButton
            testID="contribuir-copiar"
            title={copied ? "Código copiado" : "Copiar código PIX"}
            icon={Copy}
            onPress={() => void copy(code)}
          />
          <Text style={[typography.caption, styles.ref, { color: colors.textTertiary }]}>
            Referência: {result.transaction_ref}
          </Text>
        </Card>
        <AppButton testID="contribuir-outra" title="Fazer outra contribuição" variant="secondary" onPress={startOver} />
        <AppButton testID="contribuir-concluir" title="Concluir" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (!tenantSlug) {
    return (
      <StatusMessage
        testID="contribuir-sem-igreja"
        icon={HandHeart}
        message="Igreja não identificada"
        description="Saia e entre de novo no app para contribuir."
      />
    );
  }

  return (
    <Screen scroll testID="contribuir-form">
      {error ? <Alert messageTestID="contribuir-erro" message={error} /> : null}
      <Card>
        <SectionLabel>Para onde vai</SectionLabel>
        <ChoiceChips
          testID="contribuir-categoria"
          accessibilityLabel="Categoria"
          options={CATEGORY_OPTIONS}
          value={category}
          onChange={setCategory}
        />

        <Input
          testID="contribuir-valor-input"
          label="Valor (R$)"
          value={amountText}
          onChangeText={setAmountText}
          keyboardType="decimal-pad"
          placeholder="Ex.: 150,00"
        />
        {amountInvalid ? (
          <Text testID="contribuir-valor-erro" style={[typography.caption, { color: colors.danger }]}>
            Informe um valor entre {formatBRL(MIN_AMOUNT)} e {formatBRL(MAX_AMOUNT)}.
          </Text>
        ) : null}

        <SectionLabel>Como aparece para a igreja</SectionLabel>
        <ChoiceChips
          testID="contribuir-identidade"
          accessibilityLabel="Identificação"
          options={IDENTITY_OPTIONS}
          value={identity}
          onChange={setIdentity}
        />
        {identity === "named" ? (
          <Input
            testID="contribuir-nome"
            label="Seu nome"
            value={name}
            onChangeText={setName}
            autoComplete="name"
            placeholder="Como quer ser identificado"
          />
        ) : null}

        <AppButton
          testID="contribuir-enviar"
          title="Gerar PIX"
          loading={submitting}
          disabled={!canSubmit}
          onPress={canSubmit ? () => void submit() : undefined}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { marginTop: spacing.sm, marginBottom: spacing.md },
  code: { padding: spacing.md, borderRadius: spacing.sm, marginBottom: spacing.md },
  ref: { marginTop: spacing.md },
});
