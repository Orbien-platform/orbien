// Cadastrar visitante (v2, liderança — `VisitanteScreen` em
// docs/design/orbita-v2/produto/proto/app-screens2.jsx).
//
// Três passos, como no protótipo:
// 1. formulário: nome, telefone, e-mail, sexo, origem e o consentimento do
//    visitante (obrigatório — sem ele o botão não habilita);
// 2. telefone já cadastrado: a API não cria e devolve quem tem o número. A
//    liderança escolhe "registrar nova visita" (é a mesma pessoa) ou "é outra
//    pessoa" (cria mesmo assim);
// 3. concluído, com "cadastrar outro".
//
// Aberto ao líder de célula (`POST /visitors`). Origem "PG" só aparece para
// quem lidera um grupo, e a visita vai para esse grupo.
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";

import { Alert } from "../components/Alert";
import { AppButton } from "../components/AppButton";
import { Avatar } from "../components/Avatar";
import { Card } from "../components/Card";
import { ChoiceChips, type Choice } from "../components/ChoiceChips";
import { Input } from "../components/Input";
import { Screen } from "../components/Screen";
import { SectionLabel } from "../components/SectionLabel";
import { StatusMessage } from "../components/StatusMessage";
import { HttpError, NetworkError } from "../lib/api/errors";
import { formatLongDate } from "../lib/format/date";
import { listMyGroups } from "../lib/pequenos-grupos/pequenos-grupos-client";
import type { SmallGroupMine } from "../lib/pequenos-grupos/types";
import { CircleAlert, CircleCheck, Mail, Phone, UserPlus } from "../lib/theme/icons";
import { useGroupTerm } from "../lib/theme/terminology";
import { useTheme } from "../lib/theme/theme-provider";
import { spacing, typography } from "../lib/theme/tokens";
import {
  recordVisitForExisting,
  registerVisitor,
  registerVisitorAnyway,
  type DuplicateMatch,
  type NewVisitor,
  type RegisterVisitorResult,
  type VisitOrigin,
  type VisitorGender,
} from "../lib/visitantes/visitantes-client";

const CLASSIFICATION_LABELS: Record<DuplicateMatch["classification"], string> = {
  visitor: "Visitante",
  attendee: "Frequentador",
  member: "Membro",
};

const GENDER_OPTIONS: Choice<VisitorGender>[] = [
  { value: "female", label: "Feminino" },
  { value: "male", label: "Masculino" },
];

function describeSubmitError(error: unknown): string {
  if (error instanceof NetworkError) {
    return "Sem conexão. Os dados continuam aqui — tente de novo quando a conexão voltar.";
  }
  if (error instanceof HttpError && error.status === 403) {
    return "Seu papel não cadastra visitantes. Peça à secretaria da igreja.";
  }
  if (error instanceof HttpError && error.status === 400) {
    return error.message;
  }
  return "Não foi possível cadastrar. Tente de novo em instantes.";
}

type Done = Extract<RegisterVisitorResult, { person: unknown }>;

export default function VisitanteScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const groupTerm = useGroupTerm();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<VisitorGender | null>(null);
  const [origin, setOrigin] = useState<VisitOrigin>("service");
  const [consent, setConsent] = useState(false);
  const [ledGroups, setLedGroups] = useState<SmallGroupMine[]>([]);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[] | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  // Só quem lidera um grupo vê a origem "PG": a visita precisa de um grupo.
  useEffect(() => {
    let cancelled = false;
    listMyGroups()
      .then((groups) => {
        if (!cancelled) setLedGroups(groups.filter((g) => g.role === "leader"));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const groupId = origin === "small_group" ? ledGroups[0]?.id : undefined;
  const originOptions: Choice<VisitOrigin>[] = [
    { value: "service", label: "Culto" },
    ...(ledGroups.length > 0 ? [{ value: "small_group" as const, label: groupTerm.singular }] : []),
    { value: "event", label: "Evento" },
    { value: "other", label: "Outro" },
  ];

  const visitor: NewVisitor = {
    full_name: fullName,
    phone,
    email,
    origin,
    ...(gender ? { gender } : {}),
    ...(groupId ? { small_group_id: groupId } : {}),
  };
  const canSubmit = fullName.trim().length >= 2 && consent && submitting === null;

  async function submit(key: string, call: () => Promise<RegisterVisitorResult>) {
    setError(null);
    setSubmitting(key);
    try {
      const result = await call();
      if (result.status === "duplicate") {
        setDuplicates(result.matches);
      } else {
        setDuplicates(null);
        setDone(result);
      }
    } catch (caught) {
      // Os campos ficam como estavam: quem perdeu a conexão não redigita nada.
      setError(describeSubmitError(caught));
    } finally {
      setSubmitting(null);
    }
  }

  function startOver() {
    setFullName("");
    setPhone("");
    setEmail("");
    setGender(null);
    setConsent(false);
    setDuplicates(null);
    setDone(null);
  }

  if (done) {
    const firstName = done.person.full_name.split(" ")[0];
    return (
      <StatusMessage
        testID="visitante-sucesso"
        icon={CircleCheck}
        message={done.status === "registered" ? "Visitante cadastrado" : "Visita registrada"}
        description={
          done.reclassified
            ? `${firstName} agora é frequentador — 3 visitas em 60 dias.`
            : `${done.person.full_name} · hoje`
        }
      >
        <AppButton
          testID="visitante-outro"
          title="Cadastrar outro visitante"
          icon={UserPlus}
          onPress={startOver}
        />
        <AppButton
          testID="visitante-concluir"
          title="Concluir"
          variant="secondary"
          onPress={() => router.back()}
          style={styles.after}
        />
      </StatusMessage>
    );
  }

  if (duplicates) {
    return (
      <Screen scroll testID="visitante-duplicados">
        <Alert icon={CircleAlert} message="Este telefone já está cadastrado." />
        {error ? <Alert messageTestID="visitante-erro" message={error} /> : null}
        {duplicates.map((dup) => (
          <Card key={dup.id} testID={`visitante-duplicado-${dup.id}`}>
            <View style={styles.dupRow}>
              <Avatar name={dup.full_name} />
              <View style={styles.dupText}>
                <Text style={[typography.h3, { color: colors.textPrimary }]}>{dup.full_name}</Text>
                <Text style={[typography.caption, { color: colors.textTertiary }]}>
                  {[
                    CLASSIFICATION_LABELS[dup.classification],
                    `${dup.visits} ${dup.visits === 1 ? "visita" : "visitas"}`,
                    dup.last_visit_at ? `última em ${formatLongDate(dup.last_visit_at)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
            </View>
            <AppButton
              testID={`visitante-mesma-pessoa-${dup.id}`}
              title="Registrar nova visita"
              loading={submitting === `mesma-${dup.id}`}
              onPress={() =>
                submit(`mesma-${dup.id}`, () => recordVisitForExisting(dup.id, origin, groupId))
              }
              style={styles.after}
            />
          </Card>
        ))}
        <AppButton
          testID="visitante-outra-pessoa"
          title="É outra pessoa · criar novo"
          variant="secondary"
          loading={submitting === "outra"}
          onPress={() => submit("outra", () => registerVisitorAnyway(visitor))}
        />
        <AppButton
          testID="visitante-voltar"
          title="Voltar ao formulário"
          variant="ghost"
          onPress={() => setDuplicates(null)}
          style={styles.after}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll testID="visitante-form">
      <Input
        testID="visitante-nome"
        label="Nome"
        placeholder="Nome e sobrenome"
        value={fullName}
        onChangeText={setFullName}
        autoCapitalize="words"
        autoComplete="name"
        returnKeyType="next"
      />
      <Input
        testID="visitante-telefone"
        label="Telefone / WhatsApp"
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
      />

      <View style={styles.field}>
        <SectionLabel>Sexo</SectionLabel>
        <ChoiceChips
          testID="visitante-sexo"
          accessibilityLabel="Sexo"
          options={GENDER_OPTIONS}
          value={gender}
          onChange={setGender}
        />
      </View>
      <View style={styles.field}>
        <SectionLabel>Origem</SectionLabel>
        <ChoiceChips
          testID="visitante-origem"
          accessibilityLabel="Origem"
          options={originOptions}
          value={origin}
          onChange={setOrigin}
        />
      </View>

      <Card style={styles.consent}>
        <View style={styles.consentRow}>
          <Switch
            testID="visitante-consentimento"
            value={consent}
            onValueChange={setConsent}
            trackColor={{ false: colors.borderStrong, true: colors.success }}
            accessibilityLabel="Consentimento do visitante"
          />
          <Text style={[typography.bodyMedium, styles.consentText, { color: colors.textPrimary }]}>
            O visitante autoriza a igreja a guardar estes dados e entrar em contato.{" "}
            <Text style={{ color: colors.textTertiary }}>Obrigatório</Text>
          </Text>
        </View>
      </Card>

      {error ? <Alert messageTestID="visitante-erro" message={error} /> : null}
      <AppButton
        testID="visitante-enviar"
        title="Cadastrar"
        icon={UserPlus}
        onPress={() => submit("enviar", () => registerVisitor(visitor))}
        loading={submitting === "enviar"}
        disabled={!canSubmit}
      />
      <Text style={[typography.caption, styles.note, { color: colors.textTertiary }]}>
        3 visitas em 60 dias tornam a pessoa frequentadora automaticamente.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  after: { marginTop: spacing.sm },
  field: { marginBottom: spacing.lg },
  consent: { marginTop: spacing.xs },
  consentRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  consentText: { flex: 1 },
  note: { textAlign: "center", marginTop: spacing.md },
  dupRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  dupText: { flex: 1 },
});
