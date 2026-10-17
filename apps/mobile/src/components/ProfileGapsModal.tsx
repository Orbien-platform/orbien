// Confirmação obrigatória de cadastro, logo depois do login.
//
// Se a pessoa da conta não tem sexo, telefone ou data de nascimento, este
// modal cobre o app e pede só o que falta. Não fecha por gesto, botão de
// voltar do Android nem toque fora: as saídas são "Confirmar dados" ou "Sair
// da conta". Quem diz o que falta é a API (`GET /me/profile-gaps`); a gravação
// é `PATCH /me`, o autosserviço do titular.
//
// Montado só com a sessão autenticada (`_layout.tsx`), então roda a cada login
// e a cada abertura do app com sessão salva — e some sozinho quando o cadastro
// está completo. Se a consulta falhar, não aparece (`getProfileGaps` devolve
// vazio): a sessão não é bloqueada por um dado que não deu para conferir.
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { useAuth } from "../lib/auth/auth-provider";
import { HttpError, NetworkError } from "../lib/api/errors";
import { maskBirthDate, maskPhone, parseBirthDate, isValidPhone, phoneDigits } from "../lib/format/profile-input";
import {
  getProfileGaps,
  updateMyData,
  type MyDataPatch,
  type MyPerson,
  type ProfileGap,
} from "../lib/privacidade/privacidade-client";
import { CalendarDays, Phone } from "../lib/theme/icons";
import { useTheme } from "../lib/theme/theme-provider";
import { spacing, typography } from "../lib/theme/tokens";
import { Alert } from "./Alert";
import { AppButton } from "./AppButton";
import { ChoiceChips, type Choice } from "./ChoiceChips";
import { Input } from "./Input";
import { SectionLabel } from "./SectionLabel";

type Gender = NonNullable<MyPerson["gender"]>;

const GENDER_OPTIONS: Choice<Gender>[] = [
  { value: "female", label: "Feminino" },
  { value: "male", label: "Masculino" },
  { value: "other", label: "Outro" },
  { value: "prefer_not_to_say", label: "Prefiro não informar" },
];

function describeSaveError(error: unknown): string {
  if (error instanceof NetworkError) {
    return "Sem conexão. Os dados continuam aqui — tente de novo quando a conexão voltar.";
  }
  if (error instanceof HttpError && error.status === 400) return error.message;
  return "Não foi possível salvar. Tente de novo em instantes.";
}

export function ProfileGapsModal() {
  const { logout } = useAuth();
  const { colors } = useTheme();
  const [missing, setMissing] = useState<ProfileGap[]>([]);
  const [gender, setGender] = useState<Gender | null>(null);
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getProfileGaps().then((gaps) => {
      if (!cancelled) setMissing(gaps);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (missing.length === 0) return null;

  const needs = (gap: ProfileGap) => missing.includes(gap);
  const isoBirth = parseBirthDate(birthDate);
  const valid =
    (!needs("gender") || gender !== null) &&
    (!needs("phone") || isValidPhone(phone)) &&
    (!needs("birth_date") || isoBirth !== null);

  async function handleSave() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    const patch: MyDataPatch = {};
    if (needs("gender") && gender) patch.gender = gender;
    if (needs("phone")) patch.phone = phoneDigits(phone);
    if (needs("birth_date") && isoBirth) patch.birth_date = isoBirth;
    try {
      await updateMyData(patch);
      setMissing([]);
    } catch (err) {
      setError(describeSaveError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <Modal
      visible
      animationType="slide"
      // Android: o botão de voltar não fecha.
      onRequestClose={() => {}}
      testID="profile-gaps-modal"
    >
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.bgBase }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[typography.h2, { color: colors.textPrimary }]}>Confirme seus dados</Text>
          <Text style={[typography.body, styles.lead, { color: colors.textSecondary }]}>
            Precisamos destas informações para continuar. Leva menos de um minuto.
          </Text>

          {needs("gender") ? (
            <View style={styles.field}>
              <SectionLabel>Sexo</SectionLabel>
              <ChoiceChips
                testID="gaps-gender"
                accessibilityLabel="Sexo"
                options={GENDER_OPTIONS}
                value={gender}
                onChange={setGender}
              />
            </View>
          ) : null}

          {needs("phone") ? (
            <Input
              testID="gaps-phone"
              label="Telefone"
              icon={Phone}
              value={phone}
              onChangeText={(text) => setPhone(maskPhone(text))}
              keyboardType="phone-pad"
              placeholder="(11) 99999-9999"
              maxLength={15}
              autoComplete="tel"
            />
          ) : null}

          {needs("birth_date") ? (
            <Input
              testID="gaps-birth-date"
              label="Data de nascimento"
              icon={CalendarDays}
              value={birthDate}
              onChangeText={(text) => setBirthDate(maskBirthDate(text))}
              keyboardType="number-pad"
              placeholder="DD/MM/AAAA"
              maxLength={10}
            />
          ) : null}

          {error ? <Alert messageTestID="gaps-error" message={error} /> : null}

          <AppButton
            testID="gaps-save"
            title="Confirmar dados"
            loading={saving}
            disabled={!valid}
            onPress={handleSave}
            style={styles.save}
          />
          <AppButton
            testID="gaps-logout"
            title="Sair da conta"
            variant="ghost"
            loading={signingOut}
            onPress={handleLogout}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.xxl, paddingTop: spacing.xxxl * 2, gap: spacing.sm },
  lead: { marginBottom: spacing.lg },
  field: { marginBottom: spacing.md },
  save: { marginTop: spacing.md },
});
