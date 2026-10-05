"use client";

/**
 * Autocadastro de visitante pelo QR (PROD-34).
 *
 * A liderança projeta o QR pelo app (Mais › QR de autocadastro, PROD-29) e o
 * visitante cai aqui, no celular dele, sem instalar nada. O endereço é
 * `/visitante/{tenant_slug}/{token}` — `signupUrl` em
 * apps/mobile/src/lib/visitantes/visitantes-client.ts monta o mesmo formato.
 *
 * Ao abrir, a página lê o QR (`GET /public/visitor/qr/:token`) para mostrar de
 * qual igreja ele é e recusar um QR desativado antes de a pessoa digitar tudo.
 * O envio é `POST /public/visitor/register`; quem decide a igreja é o token,
 * não o slug — o slug fica no caminho pelo mesmo motivo de `/doar/{slug}`.
 *
 * O texto do aceite é o termo `visitor_consent_v1`
 * (legal/consent-terms/visitor_consent_v1.md). Mudou o texto, muda a versão.
 */
import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import axios from "axios";
import { Check, Loader2, QrCode, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";

type Origin = "service" | "small_group" | "event" | "other";

interface QrInfo {
  church_name: string;
  origin: Origin;
  label: string | null;
}

interface RegisterResult {
  status: "registered" | "visit_recorded";
  message: string;
}

type Gender = "" | "female" | "male" | "other" | "prefer_not_to_say";

const ORIGIN_CONTEXT: Record<Origin, string> = {
  service: "Cadastro de visitante do culto",
  small_group: "Cadastro de visitante do grupo",
  event: "Cadastro de visitante do evento",
  other: "Cadastro de visitante",
};

/** Só dígitos e o `+` inicial — a API compara o telefone como texto. */
function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; info: QrInfo }
  | { kind: "invalid" }
  | { kind: "error" };

export default function VisitanteAutocadastroPage() {
  const params = useParams<{ tenant_slug: string; token: string }>();
  const token = params.token;

  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<Gender>("");
  const [consent, setConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");
  const [result, setResult] = useState<RegisterResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<QrInfo>(`/public/visitor/qr/${encodeURIComponent(token)}`)
      .then(({ data }) => {
        if (!cancelled) setLoad({ kind: "ready", info: data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const notFound = axios.isAxiosError(err) && err.response?.status === 404;
        setLoad({ kind: notFound ? "invalid" : "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  const nameOk = fullName.trim().length >= 2;
  const canSubmit = nameOk && consent && !isSubmitting;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setApiError("");
    setIsSubmitting(true);
    try {
      const normalized = normalizePhone(phone);
      const { data } = await api.post<RegisterResult>("/public/visitor/register", {
        token,
        full_name: fullName.trim(),
        phone: normalized || undefined,
        email: email.trim() || undefined,
        gender: gender || undefined,
        lgpd_consent: true,
      });
      setResult(data);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setLoad({ kind: "invalid" });
      } else if (axios.isAxiosError(err) && err.response?.status === 429) {
        setApiError(
          "Muitos cadastros seguidos nesta rede. Tente de novo em alguns minutos ou peça ajuda à recepção.",
        );
      } else {
        setApiError(apiErrorMessage(err, "Não foi possível enviar agora. Tente de novo."));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-parchment)] px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] p-8 shadow-[var(--shadow-md)]">
          {load.kind === "loading" ? (
            <div className="flex justify-center py-10" role="status" aria-label="Carregando">
              <Loader2 size={24} className="animate-spin text-stone motion-reduce:animate-none" />
            </div>
          ) : load.kind === "invalid" ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <QrCode size={32} strokeWidth={1.5} className="text-stone" aria-hidden="true" />
              <h1 className="font-serif text-3xl leading-tight text-ink dark:text-white">
                Este QR não está mais ativo
              </h1>
              <p className="text-sm text-stone">
                Peça à recepção o código de cadastro que está valendo hoje.
              </p>
            </div>
          ) : load.kind === "error" ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center" role="alert">
              <h1 className="font-serif text-3xl leading-tight text-ink dark:text-white">
                Não foi possível abrir o cadastro
              </h1>
              <p className="text-sm text-stone">Confira a internet do celular e tente de novo.</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setLoad({ kind: "loading" });
                  setAttempt((n) => n + 1);
                }}
                className="h-10 rounded-[8px]"
              >
                <RefreshCw size={14} />
                Tentar de novo
              </Button>
            </div>
          ) : result ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center" role="status">
              <span className="flex size-14 items-center justify-center rounded-full bg-teal-dim">
                <Check size={28} strokeWidth={1.75} className="text-teal-ink" aria-hidden="true" />
              </span>
              <h1 className="font-serif text-3xl leading-tight text-ink dark:text-white">
                {result.status === "visit_recorded" ? "Que bom te ver de novo" : "Cadastro feito"}
              </h1>
              <p className="text-sm text-stone">{result.message}</p>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <p className="text-sm text-stone">{load.info.label?.trim() || ORIGIN_CONTEXT[load.info.origin]}</p>
                <h1 className="mt-1 font-serif text-[32px] leading-[1.05] text-ink dark:text-white">
                  Que bom ter você na {load.info.church_name}
                </h1>
                <p className="mt-3 text-sm font-light text-stone">
                  Deixe seu nome e um contato. Alguém da igreja vai falar com você.
                </p>
              </div>

              <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="full_name" className="text-sm font-medium text-ink dark:text-white">
                    Nome
                  </Label>
                  <Input
                    id="full_name"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    autoComplete="name"
                    required
                    disabled={isSubmitting}
                    className="rounded-[8px]"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="phone" className="text-sm font-medium text-ink dark:text-white">
                    WhatsApp (opcional)
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    placeholder="(11) 99999-0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="tel"
                    disabled={isSubmitting}
                    className="rounded-[8px]"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email" className="text-sm font-medium text-ink dark:text-white">
                    E-mail (opcional)
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    disabled={isSubmitting}
                    className="rounded-[8px]"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="gender" className="text-sm font-medium text-ink dark:text-white">
                    Sexo (opcional)
                  </Label>
                  <select
                    id="gender"
                    value={gender}
                    onChange={(e) => setGender(e.target.value as Gender)}
                    disabled={isSubmitting}
                    className="h-9 rounded-[8px] border border-[var(--border-default)] bg-transparent px-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-white"
                  >
                    <option value="">Não informar</option>
                    <option value="female">Feminino</option>
                    <option value="male">Masculino</option>
                    <option value="other">Outro</option>
                    <option value="prefer_not_to_say">Prefiro não dizer</option>
                  </select>
                </div>

                <div className="flex items-start gap-2">
                  <input
                    id="lgpd_consent"
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    disabled={isSubmitting}
                    className="mt-0.5 size-4 shrink-0 accent-[var(--color-navy)]"
                  />
                  <Label htmlFor="lgpd_consent" className="text-xs font-normal leading-relaxed text-stone">
                    Aceito que a {load.info.church_name} guarde meu nome e meus contatos para me
                    receber e falar comigo por WhatsApp ou e-mail. Posso pedir a exclusão dos meus
                    dados à igreja a qualquer momento.
                  </Label>
                </div>

                {apiError && (
                  <div className="rounded-[8px] bg-crimson-dim px-3 py-2" role="alert">
                    <p className="text-sm text-crimson">{apiError}</p>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={!canSubmit}
                  className="mt-1 h-10 w-full rounded-[8px] bg-navy font-sans text-sm font-medium text-white hover:bg-[var(--color-navy-dark)] disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="mr-2 animate-spin motion-reduce:animate-none" />
                      Enviando…
                    </>
                  ) : (
                    "Enviar cadastro"
                  )}
                </Button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-text">Orbien · Gestão de igrejas</p>
      </div>
    </div>
  );
}
