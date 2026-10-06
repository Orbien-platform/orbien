// Pedir troca (v2, `TrocaScreen` em
// docs/design/orbita-v2/produto/proto/app-screens2.jsx).
//
// Lista os colegas do ministério que podem assumir a escala (`GET
// /assignments/:id/swap-candidates`): livres primeiro, depois quem já está
// em outro ministério no mesmo culto e quem marcou indisponibilidade na
// data — a API ordena, a tela só diz o porquê. "Pedir" manda a um colega;
// "Pedir para qualquer um do ministério" manda a todos, e o primeiro que
// aceitar assume.
//
// `ministerio` e `quando` chegam por parâmetro só para o cabeçalho: a escala
// já está na tela anterior e não há rota que a leia sozinha.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Alert } from "../../components/Alert";
import { AppButton } from "../../components/AppButton";
import { Avatar } from "../../components/Avatar";
import { Card } from "../../components/Card";
import { Input } from "../../components/Input";
import { Screen } from "../../components/Screen";
import { SectionLabel } from "../../components/SectionLabel";
import { StatusMessage } from "../../components/StatusMessage";
import { HttpError, NetworkError } from "../../lib/api/errors";
import { describeLoadError, type LoadErrorState } from "../../lib/api/load-error";
import { getSwapCandidates, requestSwap } from "../../lib/escala/escala-client";
import type { CandidateAvailability, SwapCandidate } from "../../lib/escala/types";
import { CircleAlert, CircleCheck, MessageSquare, Users, WifiOff } from "../../lib/theme/icons";
import { useTheme } from "../../lib/theme/theme-provider";
import { spacing, typography } from "../../lib/theme/tokens";

const AVAILABILITY_LABEL: Record<CandidateAvailability, string> = {
  free: "Livre neste dia",
  busy: "Já escalado em outro ministério neste culto",
  unavailable: "Marcou indisponibilidade nesta data",
};

function describeSendError(error: unknown): string {
  if (error instanceof NetworkError) {
    return "Sem conexão. O pedido não foi enviado — tente de novo quando a conexão voltar.";
  }
  if (error instanceof HttpError && (error.status === 409 || error.status === 422)) {
    return error.message;
  }
  return "Não foi possível enviar o pedido. Tente de novo em instantes.";
}

export default function TrocaScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { id, ministerio, quando } = useLocalSearchParams<{
    id: string;
    ministerio?: string;
    quando?: string;
  }>();
  const [candidates, setCandidates] = useState<SwapCandidate[] | null>(null);
  const [loadError, setLoadError] = useState<LoadErrorState | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<SwapCandidate | "ministerio" | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSwapCandidates(id)
      .then((result) => {
        if (!cancelled) setCandidates(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(describeLoadError(err, "os substitutos"));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function send(target: SwapCandidate | "ministerio") {
    // Ref, não o state: dois toques antes do re-render veriam `sending` nulo
    // e mandariam dois pedidos (mesmo guarda de escala.tsx).
    if (sendingRef.current) return;
    const key = target === "ministerio" ? "ministerio" : target.volunteer_profile_id;
    sendingRef.current = true;
    setSending(key);
    setSendError(null);
    try {
      await requestSwap(id, target === "ministerio" ? undefined : target.volunteer_profile_id, message);
      setSentTo(target);
    } catch (err) {
      setSendError(describeSendError(err));
    } finally {
      sendingRef.current = false;
      setSending(null);
    }
  }

  if (sentTo) {
    return (
      <StatusMessage
        testID="troca-enviada"
        icon={CircleCheck}
        message="Pedido de troca enviado"
        description={
          sentTo === "ministerio"
            ? "Quem servir no ministério e aceitar primeiro assume a escala."
            : `${sentTo.full_name} recebe um aviso. A escala só muda quando aceitar.`
        }
      >
        <AppButton testID="troca-voltar" title="Voltar às escalas" onPress={() => router.back()} />
      </StatusMessage>
    );
  }

  if (loadError) {
    return (
      <StatusMessage
        testID="troca-erro"
        icon={loadError.offline ? WifiOff : CircleAlert}
        message={loadError.message}
        description={loadError.description}
        tone="danger"
      />
    );
  }

  const heading = [ministerio, quando].filter(Boolean).join(" · ");

  return (
    <Screen scroll testID="troca-screen">
      {heading ? (
        <Text style={[typography.h2, styles.heading, { color: colors.textPrimary }]}>{heading}</Text>
      ) : null}

      <SectionLabel>Substitutos do ministério</SectionLabel>
      <Text style={[typography.caption, styles.hint, { color: colors.textTertiary }]}>
        Quem está livre aparece primeiro, pela indisponibilidade que cada um informou.
      </Text>

      {candidates !== null && candidates.length === 0 ? (
        <Text testID="troca-sem-candidatos" style={[typography.body, styles.hint, { color: colors.textSecondary }]}>
          Ninguém mais serve neste ministério. Fale com a liderança para resolver a escala.
        </Text>
      ) : null}

      {(candidates ?? []).map((candidate) => (
        <Card key={candidate.volunteer_profile_id} testID={`candidato-${candidate.volunteer_profile_id}`} style={styles.card}>
          <View style={styles.row}>
            <Avatar name={candidate.full_name} />
            <View style={styles.body}>
              <Text style={[typography.h3, { color: colors.textPrimary }]}>{candidate.full_name}</Text>
              <Text
                style={[
                  typography.caption,
                  { color: candidate.availability === "free" ? colors.success : colors.textTertiary },
                ]}
              >
                {AVAILABILITY_LABEL[candidate.availability]}
              </Text>
            </View>
            <AppButton
              testID={`pedir-${candidate.volunteer_profile_id}`}
              title="Pedir"
              variant="secondary"
              loading={sending === candidate.volunteer_profile_id}
              disabled={sending !== null}
              onPress={() => send(candidate)}
            />
          </View>
        </Card>
      ))}

      {candidates !== null && candidates.length > 0 ? (
        <>
          <View style={styles.message}>
            <Input
              testID="troca-mensagem"
              label="Mensagem (opcional)"
              icon={MessageSquare}
              placeholder="Ex.: vou viajar nesse fim de semana"
              value={message}
              onChangeText={setMessage}
              maxLength={280}
            />
          </View>
          {sendError ? <Alert messageTestID="troca-envio-erro" message={sendError} /> : null}
          <AppButton
            testID="pedir-ministerio"
            title="Pedir para qualquer um do ministério"
            variant="ghost"
            icon={Users}
            loading={sending === "ministerio"}
            disabled={sending !== null}
            onPress={() => send("ministerio")}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { marginBottom: spacing.lg },
  hint: { marginBottom: spacing.md },
  card: { marginBottom: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  body: { flex: 1 },
  message: { marginTop: spacing.md },
});
