// QR de autocadastro (v2, liderança — entrada "QR de autocadastro" da
// `MaisScreen` em docs/design/orbita-v2/produto/proto/app-shell.jsx).
//
// Lista os QRs ativos da congregação (`GET /admin/visitor/qr`) e abre o
// escolhido em tela cheia para projetar no culto (`/autocadastro-qr`). O
// visitante lê com a câmera do próprio celular e cai na página pública do
// web, sem instalar o app.
//
// Sem nenhum QR ativo, a ação do estado vazio cria o do culto — é o caso de
// quase toda igreja. "Novo QR" (`/autocadastro-novo`) cria o de grupo, evento
// ou outro; tocar num QR abre `/autocadastro-editar`, onde se mostra, renomeia
// e liga/desliga — o mesmo desenho do painel web (`/pessoas/qr-visitantes`).
//
// Papéis em `SIGNUP_QR_ROLES` (src/lib/auth/roles.ts), espelho de
// `MANAGE_ROLES` da API. A Mais já esconde a linha de quem não tem;
// aqui o cadeado cobre quem chega por link, e o 403 da API, quem tem papel
// no token mas não no banco.
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { Alert } from "../components/Alert";
import { AppButton } from "../components/AppButton";
import { ListGroup } from "../components/ListGroup";
import { Screen } from "../components/Screen";
import { SectionLabel } from "../components/SectionLabel";
import { StatusMessage } from "../components/StatusMessage";
import { HttpError } from "../lib/api/errors";
import { describeLoadError, type LoadErrorState } from "../lib/api/load-error";
import { useAuth } from "../lib/auth/auth-provider";
import { decodeJwtPayload } from "../lib/auth/jwt";
import { SIGNUP_QR_ROLES } from "../lib/auth/roles";
import { CircleAlert, Lock, Plus, QrCode, RefreshCw, WifiOff } from "../lib/theme/icons";
import { useTheme } from "../lib/theme/theme-provider";
import { spacing, typography } from "../lib/theme/tokens";
import {
  createSignupQr,
  listSignupQrs,
  ORIGIN_LABELS,
  type SignupQr,
} from "../lib/visitantes/visitantes-client";
import { useReloadOnReconnect } from "../lib/network/use-reload-on-reconnect";

function qrTitle(item: Pick<SignupQr, "label" | "origin">): string {
  return item.label?.trim() || ORIGIN_LABELS[item.origin];
}

export default function AutocadastroScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { colors, brandInk } = useTheme();
  const roles = session ? decodeJwtPayload(session.accessToken)?.roles ?? [] : [];
  const allowed = roles.some((role) => SIGNUP_QR_ROLES.includes(role));

  const [qrs, setQrs] = useState<SignupQr[] | null>(null);
  const [error, setError] = useState<LoadErrorState | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  // PROD-32: sem conexão, a tela relê sozinha quando ela volta — a mesma
  // releitura do "Tentar novamente", nunca uma escrita.
  const retry = () => {
    setError(null);
    setRetryCount((n) => n + 1);
  };
  useReloadOnReconnect(error?.offline === true, retry);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(false);
  const creatingRef = useRef(false);

  // Relê ao voltar de "Novo QR" / "Gerenciar": o que mudou lá aparece aqui.
  useFocusEffect(
    useCallback(() => {
      if (!allowed) return;
      let cancelled = false;
      listSignupQrs()
        .then((all) => {
          if (!cancelled) setQrs(all);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          if (err instanceof HttpError && err.status === 403) setForbidden(true);
          else setError(describeLoadError(err, "os QRs de autocadastro"));
        });
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allowed, retryCount]),
  );

  function open(item: SignupQr) {
    router.push({
      pathname: "/autocadastro-qr",
      params: { token: item.token, title: qrTitle(item) },
    });
  }

  function manage(item: SignupQr) {
    router.push({
      pathname: "/autocadastro-editar",
      params: {
        id: item.id,
        token: item.token,
        origin: item.origin,
        label: item.label ?? "",
        active: item.is_active ? "1" : "0",
        scans: String(item.scan_count),
      },
    });
  }

  async function createServiceQr() {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    setCreateError(false);
    try {
      const created = await createSignupQr("service", "Culto");
      setQrs((current) => [created, ...(current ?? [])]);
      open(created);
    } catch {
      setCreateError(true);
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }

  if (!allowed || forbidden) {
    return (
      <StatusMessage
        testID="autocadastro-sem-acesso"
        icon={Lock}
        message="Só a liderança da igreja abre os QRs de autocadastro."
        description="Pastores, secretaria e administradores veem esta tela. Peça a um deles para projetar o QR."
      />
    );
  }

  if (error) {
    return (
      <StatusMessage
        testID="autocadastro-erro"
        icon={error.offline ? WifiOff : CircleAlert}
        message={error.message}
        description={error.description}
        tone="danger"
      >
        <AppButton
          testID="autocadastro-retry"
          title="Tentar novamente"
          icon={RefreshCw}
          variant="secondary"
          onPress={retry}
        />
      </StatusMessage>
    );
  }

  if (qrs === null) {
    return (
      <Screen center testID="autocadastro-carregando">
        <ActivityIndicator color={brandInk} />
      </Screen>
    );
  }

  const active = qrs.filter((item) => item.is_active);
  const inactive = qrs.filter((item) => !item.is_active);

  if (active.length === 0 && inactive.length === 0) {
    return (
      <StatusMessage
        testID="autocadastro-vazio"
        icon={QrCode}
        message="Nenhum QR de autocadastro ativo."
        description="Crie o do culto: o visitante lê com o celular, deixa nome e WhatsApp e entra na lista de visitantes."
      >
        <View style={styles.emptyAction}>
          {createError ? (
            <Alert
              messageTestID="autocadastro-criar-erro"
              message="Não foi possível criar o QR. Tente de novo."
            />
          ) : null}
          <AppButton
            testID="autocadastro-criar"
            title="Criar QR do culto"
            icon={Plus}
            loading={creating}
            onPress={createServiceQr}
          />
        </View>
      </StatusMessage>
    );
  }

  const rows = (list: SignupQr[]) =>
    list.map((item) => ({
      key: item.id,
      testID: `autocadastro-qr-${item.id}`,
      label: qrTitle(item),
      sub: `${ORIGIN_LABELS[item.origin]} · ${
        item.scan_count === 1 ? "1 cadastro" : `${item.scan_count} cadastros`
      }`,
      icon: QrCode,
      onPress: () => manage(item),
    }));

  return (
    <Screen scroll testID="autocadastro-lista">
      <Text style={[typography.body, styles.intro, { color: colors.textSecondary }]}>
        Escolha o QR para projetar no telão. O visitante lê com o celular e se cadastra numa
        página da igreja, sem instalar o app.
      </Text>
      <AppButton
        testID="autocadastro-novo"
        title="Novo QR"
        icon={Plus}
        variant="secondary"
        onPress={() => router.push("/autocadastro-novo")}
      />
      <View style={styles.spacer} />
      {active.length > 0 ? (
        <>
          <SectionLabel trailing={String(active.length)}>Ativos</SectionLabel>
          <ListGroup testID="autocadastro-qrs" items={rows(active)} />
        </>
      ) : null}
      {inactive.length > 0 ? (
        <>
          <SectionLabel trailing={String(inactive.length)}>Desativados</SectionLabel>
          <ListGroup testID="autocadastro-qrs-desativados" items={rows(inactive)} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { marginBottom: spacing.xl },
  spacer: { height: spacing.xl },
  emptyAction: { alignSelf: "stretch", gap: spacing.md },
});
