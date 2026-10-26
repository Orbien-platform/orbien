// Termo de consentimento do responsável (LGPD, Art. 14) — aceite e revogação.
// A versão que vai no aceite é a que a tela mostrou (`status.term_version`):
// se o termo mudou no servidor, a API recusa com 409 e a tela recarrega o
// termo novo em vez de aceitar às cegas.
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { acceptConsent, describeKidsActionError, kidsErrorCode, revokeConsent } from "../../lib/kids/kids-client";
import type { KidsConsentStatus } from "../../lib/kids/types";
import { ShieldCheck } from "../../lib/theme/icons";
import { useTheme } from "../../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, spacing, typography } from "../../lib/theme/tokens";
import { Alert } from "../Alert";
import { AppButton } from "../AppButton";

interface ConsentTermProps {
  status: KidsConsentStatus;
  /** Chamado depois de aceitar ou revogar, para a tela recarregar o estado. */
  onChanged: () => void;
}

export function ConsentTerm({ status, onChanged }: ConsentTermProps) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>, fallback: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      setConfirmingRevoke(false);
      onChanged();
    } catch (err) {
      setError(describeKidsActionError(err, fallback));
      // Termo trocado no servidor: recarrega para a pessoa ler a versão nova.
      if (kidsErrorCode(err) === "kids_term_outdated") onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <Text style={[typography.body, { color: colors.textPrimary }]}>{status.term_text}</Text>
      <Text style={[typography.caption, styles.version, { color: colors.textTertiary }]}>
        Versão {status.term_version}
      </Text>

      {error ? <Alert messageTestID="consent-error" message={error} /> : null}

      {status.valid ? (
        <View testID="consent-active" style={styles.active}>
          <ShieldCheck size={iconSize.inline} color={colors.success} strokeWidth={ICON_STROKE_WIDTH} />
          <Text style={[typography.bodyMedium, { color: colors.success }]}>Consentimento ativo</Text>
        </View>
      ) : null}

      {status.valid && !confirmingRevoke ? (
        <AppButton
          testID="consent-revoke"
          title="Revogar consentimento"
          variant="secondary"
          onPress={() => setConfirmingRevoke(true)}
        />
      ) : null}

      {status.valid && confirmingRevoke ? (
        <View style={styles.confirm}>
          <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>
            Sem o consentimento, não é possível fazer novos check-ins. O histórico de presença é mantido
            até o prazo de retenção.
          </Text>
          <AppButton
            testID="consent-revoke-confirm"
            title="Confirmar revogação"
            variant="danger"
            loading={busy}
            onPress={() => run(revokeConsent, "Não foi possível revogar. Tente novamente.")}
          />
          <AppButton
            testID="consent-revoke-cancel"
            title="Manter consentimento"
            variant="ghost"
            disabled={busy}
            onPress={() => setConfirmingRevoke(false)}
          />
        </View>
      ) : null}

      {!status.valid ? (
        <AppButton
          testID="consent-accept"
          title="Aceitar termo"
          loading={busy}
          onPress={() => run(() => acceptConsent(status.term_version), "Não foi possível registrar o aceite. Tente novamente.")}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  version: { marginTop: spacing.sm, marginBottom: spacing.lg },
  active: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.lg },
  confirm: { gap: spacing.md },
});
