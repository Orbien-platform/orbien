// Privacidade e meus dados (v2 — `LgpdScreen` em
// docs/design/orbita-v2/produto/proto/app-screens2.jsx). Os direitos do
// titular da LGPD (Art. 18) em autosserviço, sobre as rotas `/me` da API
// (`CONF-03`):
//
// - meus dados, com correção de nome, telefone e endereço (`PATCH /me`);
// - consentimentos dados, com revogação (`POST /me/revoke-consent`);
// - exportar meus dados (`GET /me/export`), entregue pela folha de
//   compartilhamento do sistema — a pessoa escolhe para onde mandar;
// - pedir exclusão da conta: anonimização em 30 dias, cancelável entrando no
//   app (`POST`/`DELETE /me/deletion-request`).
//
// Ações destrutivas (revogar, pedir exclusão) pedem confirmação na própria
// tela, sem modal: o texto do que vai acontecer fica ao lado do botão.
import { useEffect, useState } from "react";
import { ActivityIndicator, Share, StyleSheet, Text, View } from "react-native";

import { Alert } from "../components/Alert";
import { AppButton } from "../components/AppButton";
import { Card } from "../components/Card";
import { Input } from "../components/Input";
import { ListGroup } from "../components/ListGroup";
import { Screen } from "../components/Screen";
import { SectionLabel } from "../components/SectionLabel";
import { StatusMessage } from "../components/StatusMessage";
import { HttpError } from "../lib/api/errors";
import { describeLoadError, type LoadErrorState } from "../lib/api/load-error";
import { formatLongDate } from "../lib/format/date";
import {
  cancelDeletion,
  consentLabel,
  exportPersonalData,
  getPersonalData,
  requestDeletion,
  revokeConsent,
  updateMyData,
  type MyDataPatch,
  type PersonalData,
} from "../lib/privacidade/privacidade-client";
import {
  CircleAlert,
  FileText,
  Lock,
  MapPin,
  Mail,
  Pencil,
  Phone,
  RefreshCw,
  WifiOff,
} from "../lib/theme/icons";
import { useTheme } from "../lib/theme/theme-provider";
import { spacing, typography } from "../lib/theme/tokens";

const ACTION_ERROR = "Não foi possível concluir. Verifique sua conexão e tente de novo.";

function addressLine(p: PersonalData["person"]): string | null {
  const street = [p.address_street, p.address_number].filter(Boolean).join(", ");
  const parts = [street, p.address_neighborhood, p.address_city, p.address_state].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export default function PrivacidadeScreen() {
  const { colors } = useTheme();
  const [data, setData] = useState<PersonalData | null>(null);
  const [loadError, setLoadError] = useState<LoadErrorState | null>(null);
  const [noPerson, setNoPerson] = useState(false);
  const [retry, setRetry] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<MyDataPatch | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [confirmDeletion, setConfirmDeletion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPersonalData()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof HttpError && err.status === 404) setNoPerson(true);
        else setLoadError(describeLoadError(err, "seus dados"));
      });
    return () => {
      cancelled = true;
    };
  }, [retry]);

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setActionError(null);
    try {
      await action();
    } catch {
      setActionError(ACTION_ERROR);
    } finally {
      setBusy(null);
    }
  }

  if (noPerson) {
    return (
      <StatusMessage
        testID="privacidade-sem-cadastro"
        icon={Lock}
        message="Sua conta não tem cadastro de pessoa na igreja."
        description="Para pedir acesso ou exclusão de dados, fale com a secretaria da igreja."
      />
    );
  }

  if (loadError) {
    return (
      <StatusMessage
        testID="privacidade-erro"
        icon={loadError.offline ? WifiOff : CircleAlert}
        message={loadError.message}
        description={loadError.description}
        tone="danger"
      >
        <AppButton
          testID="privacidade-retry"
          title="Tentar novamente"
          icon={RefreshCw}
          variant="secondary"
          onPress={() => {
            setLoadError(null);
            setRetry((n) => n + 1);
          }}
        />
      </StatusMessage>
    );
  }

  if (!data) {
    return (
      <Screen center testID="privacidade-carregando">
        <ActivityIndicator color={colors.textTertiary} />
      </Screen>
    );
  }

  const { person, consents, deletion } = data;
  const address = addressLine(person);

  async function saveEdit() {
    if (!editing) return;
    await run("salvar", async () => {
      const updated = await updateMyData(editing);
      setData((current) => (current ? { ...current, person: { ...current.person, ...updated } } : current));
      setEditing(null);
    });
  }

  async function handleExport() {
    await run("exportar", async () => {
      const doc = await exportPersonalData();
      await Share.share({ title: "Meus dados", message: JSON.stringify(doc, null, 2) });
    });
  }

  return (
    <Screen scroll testID="privacidade-screen">
      {actionError ? <Alert messageTestID="privacidade-acao-erro" message={actionError} /> : null}

      <SectionLabel>Meus dados</SectionLabel>
      {editing ? (
        <Card testID="privacidade-edicao">
          <Input
            testID="privacidade-nome"
            label="Nome"
            value={editing.full_name ?? ""}
            onChangeText={(full_name) => setEditing({ ...editing, full_name })}
            autoCapitalize="words"
          />
          <Input
            testID="privacidade-telefone"
            label="Telefone"
            icon={Phone}
            value={editing.phone ?? ""}
            onChangeText={(phone) => setEditing({ ...editing, phone })}
            keyboardType="phone-pad"
          />
          <Input
            testID="privacidade-rua"
            label="Rua"
            value={editing.address_street ?? ""}
            onChangeText={(address_street) => setEditing({ ...editing, address_street })}
          />
          <Input
            testID="privacidade-numero"
            label="Número"
            value={editing.address_number ?? ""}
            onChangeText={(address_number) => setEditing({ ...editing, address_number })}
          />
          <Input
            testID="privacidade-bairro"
            label="Bairro"
            value={editing.address_neighborhood ?? ""}
            onChangeText={(address_neighborhood) => setEditing({ ...editing, address_neighborhood })}
          />
          <Input
            testID="privacidade-cidade"
            label="Cidade"
            value={editing.address_city ?? ""}
            onChangeText={(address_city) => setEditing({ ...editing, address_city })}
          />
          <AppButton
            testID="privacidade-salvar"
            title="Salvar correção"
            onPress={saveEdit}
            loading={busy === "salvar"}
          />
          <AppButton
            testID="privacidade-cancelar-edicao"
            title="Cancelar"
            variant="ghost"
            onPress={() => setEditing(null)}
            style={styles.after}
          />
        </Card>
      ) : (
        <ListGroup
          testID="privacidade-dados"
          items={[
            { key: "nome", label: person.full_name, sub: "Nome" },
            { key: "telefone", label: person.phone ?? "Não informado", sub: "Telefone", icon: Phone },
            { key: "email", label: person.email ?? "Não informado", sub: "E-mail", icon: Mail },
            { key: "endereco", label: address ?? "Não informado", sub: "Endereço", icon: MapPin },
            {
              key: "corrigir",
              testID: "privacidade-corrigir",
              label: "Corrigir meus dados",
              icon: Pencil,
              onPress: () =>
                setEditing({
                  full_name: person.full_name,
                  phone: person.phone,
                  address_street: person.address_street,
                  address_number: person.address_number,
                  address_neighborhood: person.address_neighborhood,
                  address_city: person.address_city,
                }),
            },
          ]}
        />
      )}

      <SectionLabel>Consentimentos</SectionLabel>
      <Card testID="privacidade-consentimentos">
        {consents.length === 0 ? (
          <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>
            Nenhum consentimento registrado para o seu cadastro.
          </Text>
        ) : (
          consents.map((consent, index) => {
            const active = consent.revoked_at === null;
            return (
              <View
                key={consent.id}
                testID={`consentimento-${consent.id}`}
                style={[
                  styles.consent,
                  index > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
                ]}
              >
                <Text style={[typography.h3, { color: colors.textPrimary }]}>
                  {consentLabel(consent.version)}
                </Text>
                <Text style={[typography.caption, { color: colors.textTertiary }]}>
                  {active
                    ? `Dado em ${formatLongDate(consent.consented_at) ?? ""}`
                    : `Revogado em ${formatLongDate(consent.revoked_at ?? "") ?? ""}`}
                </Text>
                {active && confirmRevoke === consent.version ? (
                  <View style={styles.confirm}>
                    <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>
                      A igreja deixa de usar seus dados para esta finalidade. O que a lei obriga a
                      guardar continua guardado.
                    </Text>
                    <AppButton
                      testID={`revogar-confirmar-${consent.id}`}
                      title="Revogar consentimento"
                      variant="danger"
                      loading={busy === `revogar-${consent.version}`}
                      onPress={() =>
                        run(`revogar-${consent.version}`, async () => {
                          await revokeConsent(consent.version);
                          const revokedAt = new Date().toISOString();
                          setData((current) =>
                            current
                              ? {
                                  ...current,
                                  consents: current.consents.map((c) =>
                                    c.version === consent.version && c.revoked_at === null
                                      ? { ...c, revoked_at: revokedAt }
                                      : c,
                                  ),
                                }
                              : current,
                          );
                          setConfirmRevoke(null);
                        })
                      }
                    />
                    <AppButton
                      title="Manter"
                      variant="ghost"
                      onPress={() => setConfirmRevoke(null)}
                      style={styles.after}
                    />
                  </View>
                ) : active ? (
                  <AppButton
                    testID={`revogar-${consent.id}`}
                    title="Revogar"
                    variant="ghost"
                    onPress={() => setConfirmRevoke(consent.version)}
                    style={styles.inlineAction}
                  />
                ) : null}
              </View>
            );
          })
        )}
      </Card>

      <ListGroup
        testID="privacidade-exportar"
        items={[
          {
            key: "exportar",
            testID: "privacidade-exportar-item",
            label: busy === "exportar" ? "Preparando…" : "Exportar meus dados",
            sub: "Cadastro, consentimentos, grupos e doações",
            icon: FileText,
            onPress: busy ? undefined : handleExport,
          },
        ]}
      />

      {deletion.requested_at ? (
        <Card testID="privacidade-exclusao-pedida" highlightColor={colors.danger}>
          <Text style={[typography.h3, { color: colors.textPrimary }]}>Exclusão pedida</Text>
          <Text style={[typography.bodyMedium, styles.confirmText, { color: colors.textSecondary }]}>
            Seus dados serão anonimizados em{" "}
            {formatLongDate(deletion.anonymize_after ?? "") ?? "30 dias"}. Até lá, você pode cancelar
            o pedido.
          </Text>
          <AppButton
            testID="privacidade-cancelar-exclusao"
            title="Cancelar pedido"
            variant="secondary"
            loading={busy === "cancelar"}
            onPress={() =>
              run("cancelar", async () => {
                const status = await cancelDeletion();
                setData((current) => (current ? { ...current, deletion: status } : current));
              })
            }
            style={styles.after}
          />
        </Card>
      ) : confirmDeletion ? (
        <Card testID="privacidade-confirmar-exclusao" highlightColor={colors.danger}>
          <Text style={[typography.h3, { color: colors.textPrimary }]}>Excluir minha conta?</Text>
          <Text style={[typography.bodyMedium, styles.confirmText, { color: colors.textSecondary }]}>
            Seus dados são anonimizados em 30 dias. Até lá, você pode cancelar o pedido entrando no
            app.
          </Text>
          <AppButton
            testID="privacidade-confirmar-exclusao-botao"
            title="Confirmar pedido"
            variant="danger"
            loading={busy === "excluir"}
            onPress={() =>
              run("excluir", async () => {
                const status = await requestDeletion();
                setData((current) => (current ? { ...current, deletion: status } : current));
                setConfirmDeletion(false);
              })
            }
            style={styles.after}
          />
          <AppButton
            title="Voltar"
            variant="ghost"
            onPress={() => setConfirmDeletion(false)}
            style={styles.after}
          />
        </Card>
      ) : (
        <AppButton
          testID="privacidade-pedir-exclusao"
          title="Pedir exclusão da conta"
          variant="secondary"
          onPress={() => setConfirmDeletion(true)}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  consent: { paddingVertical: spacing.sm, gap: spacing.xs },
  confirm: { marginTop: spacing.sm, gap: spacing.sm },
  confirmText: { marginTop: spacing.xs, marginBottom: spacing.sm },
  inlineAction: { alignSelf: "flex-start", paddingHorizontal: 0 },
  after: { marginTop: spacing.sm },
});
