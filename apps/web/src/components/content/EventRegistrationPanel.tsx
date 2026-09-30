"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck, Clock, Copy, Hourglass, Loader2, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { formatInstant } from "@/lib/datetime";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

/** `GET .../registrations/summary` — vagas, prazo e preço, sem a lista de nomes. */
interface RegistrationSummary {
  registration_enabled: boolean;
  registration_limit: number | null;
  registration_deadline: string | null;
  registrations_closed: boolean;
  confirmed_count: number;
  waitlisted_count: number;
  /** NULL é evento sem limite de vagas. */
  seats_left: number | null;
  /** NULL é evento gratuito (PROD-16). Setado, é pago — Premium (PROD-24). */
  registration_price: number | null;
}

/** A inscrição do próprio usuário (`GET`/`POST`/`DELETE .../registrations/me`). */
interface MyRegistration {
  id: string;
  status: "confirmed" | "waitlisted" | "pending_payment" | "cancelled";
}

/** O PIX dinâmico que `POST .../registrations/me` devolve em evento pago. */
interface RegistrationPayment {
  /** Payload "copia e cola". */
  qr_code: string;
  /** PNG em base64 **sem** o prefixo `data:` — quem monta a URI é a tela. */
  qr_code_image: string;
}

interface PaidRegistrationResult {
  registration: MyRegistration;
  payment: RegistrationPayment;
}

// Testa `payment` e não `registration`: a inscrição crua também tem `id`, só o
// envelope pago tem as duas chaves.
function isPaidResult(result: MyRegistration | PaidRegistrationResult): result is PaidRegistrationResult {
  return "payment" in result;
}

const ACTION_ERROR = "Não foi possível concluir. Tente novamente.";

/**
 * `cancelled` não entra: `GET .../registrations/me` só devolve `confirmed`,
 * `waitlisted` e `pending_payment`, e quem cancelou volta a ver o botão de
 * se inscrever.
 */
const STATUS = {
  confirmed: {
    label: "Inscrição confirmada",
    hint: "Sua vaga está garantida.",
    icon: CircleCheck,
    cls: "bg-teal-dim text-teal",
  },
  waitlisted: {
    label: "Na fila de espera",
    hint: "As vagas acabaram. Se alguém desistir, você entra automaticamente, pela ordem de chegada.",
    icon: Hourglass,
    cls: "bg-navy-dim text-navy",
  },
  pending_payment: {
    label: "Aguardando pagamento",
    hint: "Sua vaga fica reservada por 24 horas. Ela só é confirmada depois que o pagamento cair.",
    icon: Clock,
    cls: "bg-[var(--surface-subtle)] text-stone",
  },
} as const;

function formatPrice(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDateTime(iso: string): string {
  return formatInstant(iso, {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface EventRegistrationPanelProps {
  postId: string;
}

/**
 * A inscrição em evento, do lado de quem se inscreve (`PROD-16`/`PROD-24`).
 *
 * Par do `EventRegistrationsPanel` (organizador) e espelho do painel de mesmo
 * nome do `apps/mobile`. O membro só enxerga `.../registrations/summary` e
 * `.../registrations/me`; `GET .../registrations` responde 403 para ele e não
 * há chamada para essa rota aqui.
 *
 * O QR do PIX só existe na resposta de `POST .../registrations/me`
 * (`PEND-07`): ele mora em estado de tela e some ao fechar o post. A nota
 * abaixo do QR diz o que fazer nesse caso — cancelar e se inscrever de novo.
 */
export function EventRegistrationPanel({ postId }: EventRegistrationPanelProps) {
  const [summary, setSummary] = useState<RegistrationSummary | null>(null);
  const [mine, setMine] = useState<MyRegistration | null>(null);
  const [payment, setPayment] = useState<RegistrationPayment | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [actionError, setActionError] = useState("");
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Trava síncrona contra clique duplo: `submitting` só vale no render
  // seguinte, e dois POST seguidos custam duas cobranças de PIX.
  const submittingRef = useRef(false);

  // O resumo é o que a tela precisa para existir; a inscrição do usuário é o
  // que ela acrescenta. `allSettled`: um 5xx em `.../me` não apaga preço,
  // vagas e prazo que já chegaram.
  useEffect(() => {
    const signal = { cancelled: false };
    Promise.allSettled([
      api.get<RegistrationSummary>(`/content/posts/${postId}/registrations/summary`),
      api.get<MyRegistration | null>(`/content/posts/${postId}/registrations/me`),
    ]).then(([summaryResult, mineResult]) => {
      if (signal.cancelled) return;
      if (summaryResult.status === "rejected") {
        setLoadError(true);
        return;
      }
      setSummary(summaryResult.value.data);
      setLoadError(false);
      // O Nest serializa `null` como 200 de corpo vazio: axios entrega "".
      // `mine` que falhou é indistinguível de "não inscrito" — a API corrige
      // no próximo clique, recusando inscrição duplicada.
      const value = mineResult.status === "fulfilled" ? mineResult.value.data : null;
      setMine(value || null);
    });
    return () => {
      signal.cancelled = true;
    };
  }, [postId, retry]);

  async function refreshSummary() {
    try {
      const { data } = await api.get<RegistrationSummary>(
        `/content/posts/${postId}/registrations/summary`
      );
      setSummary(data);
    } catch {
      // Mantém o que já está em tela.
    }
  }

  async function run(action: () => Promise<void>) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setActionError("");
    try {
      await action();
      await refreshSummary();
    } catch (error) {
      // Mensagens 4xx da API ("Vagas esgotadas para este evento") são escritas
      // para o usuário final; 5xx e rede caem no texto genérico.
      setActionError(apiErrorMessage(error, ACTION_ERROR));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const handleRegister = () =>
    run(async () => {
      const { data } = await api.post<MyRegistration | PaidRegistrationResult>(
        `/content/posts/${postId}/registrations/me`
      );
      if (isPaidResult(data)) {
        setMine(data.registration);
        setPayment(data.payment);
      } else {
        setMine(data);
      }
    });

  const handleCancel = () =>
    run(async () => {
      await api.delete(`/content/posts/${postId}/registrations/me`);
      setMine(null);
      setPayment(null);
      setCopied(false);
    });

  async function handleCopy() {
    if (!payment) return;
    setActionError("");
    try {
      await navigator.clipboard.writeText(payment.qr_code);
      setCopied(true);
    } catch {
      // Copiar é conveniência: o código continua em tela, selecionável.
      setActionError("Não foi possível copiar. Selecione o código abaixo do QR.");
    }
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-start gap-2 border-t border-[var(--border-default)] pt-3">
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar as inscrições.
        </p>
        <button
          type="button"
          onClick={() => {
            setLoadError(false);
            setRetry((n) => n + 1);
          }}
          className="text-sm font-medium text-navy hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/30 dark:text-white"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex items-center gap-2 border-t border-[var(--border-default)] pt-3 text-sm text-stone">
        <Loader2 size={14} className="animate-spin" />
        Carregando inscrições…
      </div>
    );
  }

  // Inscrição desligada e o usuário sem nada nela: não há o que mostrar.
  if (!summary.registration_enabled && !mine) return null;

  const isPaid = summary.registration_price !== null && summary.registration_price > 0;
  const soldOut = summary.seats_left !== null && summary.seats_left === 0;
  // Evento pago lotado recusa a tentativa (400): não há fila quando se cobra.
  // Gratuito lotado entra na fila, então o botão continua valendo.
  const blocked = summary.registrations_closed || (isPaid && soldOut);
  const status = mine && mine.status !== "cancelled" ? STATUS[mine.status] : null;
  const StatusIcon = status?.icon;

  return (
    <section
      aria-label="Inscrição"
      className="flex flex-col gap-3 border-t border-[var(--border-default)] pt-3"
    >
      <p className="flex items-center gap-1.5 text-sm font-medium text-ink dark:text-white">
        <Ticket size={15} strokeWidth={1.5} className="text-stone" />
        {isPaid ? formatPrice(summary.registration_price as number) : "Inscrição gratuita"}
      </p>

      {/* `seats_left` NULL é evento sem limite: dizer "vagas ilimitadas" seria
          ruído, então a linha não aparece. */}
      {(summary.seats_left !== null || summary.registration_deadline) && (
        <div className="flex flex-col gap-0.5 text-sm text-stone">
          {summary.seats_left !== null && (
            <p>
              {summary.seats_left > 0
                ? `${summary.seats_left} ${summary.seats_left === 1 ? "vaga restante" : "vagas restantes"}`
                : "Vagas esgotadas"}
            </p>
          )}
          {summary.registration_deadline && (
            <p>
              {summary.registrations_closed ? "Inscrições encerradas em " : "Inscrições até "}
              {fmtDateTime(summary.registration_deadline)}
            </p>
          )}
        </div>
      )}

      {status && StatusIcon && (
        <div className="flex flex-col items-start gap-1.5">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              status.cls
            )}
          >
            <StatusIcon size={12} strokeWidth={1.5} aria-hidden="true" />
            {status.label}
          </span>
          <p className="text-sm text-stone">{status.hint}</p>
        </div>
      )}

      {payment && (
        <div className="flex flex-col gap-2 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-subtle)] p-4">
          {/* Fundo branco fixo: QR em tema escuro, sobre fundo escuro, não lê. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- data URI do PIX, sem otimização */}
          <img
            src={`data:image/png;base64,${payment.qr_code_image}`}
            alt="QR Code do PIX para pagar a inscrição"
            className="mx-auto size-48 rounded-[8px] bg-white p-2"
          />
          <p className="text-sm text-stone">
            Escaneie o QR no app do seu banco ou copie o código abaixo.
          </p>
          {/* Sem truncar: um payload cortado é um código inválido, e é ele o
              fallback de quem não conseguiu copiar. */}
          <code
            data-testid="pix-code"
            className="block break-all rounded-[8px] bg-[var(--surface-base)] p-2 font-mono text-xs text-stone select-all"
          >
            {payment.qr_code}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex h-8 w-fit items-center gap-1.5 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-3 text-sm font-medium text-ink transition-colors hover:bg-[var(--surface-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/30 dark:text-white"
          >
            <Copy size={14} strokeWidth={1.5} />
            {copied ? "Código copiado" : "Copiar código PIX"}
          </button>
          <p className="text-xs text-stone">
            Este código vale por 24 horas e só aparece aqui agora. Se você fechar este post antes
            de pagar, cancele a inscrição e inscreva-se de novo para gerar outro.
          </p>
        </div>
      )}

      {actionError && (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      )}

      {mine ? (
        <button
          type="button"
          onClick={handleCancel}
          disabled={submitting}
          className="inline-flex h-8 w-fit items-center gap-1.5 rounded-[8px] px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30 disabled:opacity-50"
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          Cancelar inscrição
        </button>
      ) : blocked ? (
        <p className="text-sm text-stone">
          {summary.registrations_closed
            ? "As inscrições para este evento estão encerradas."
            : "As vagas para este evento acabaram."}
        </p>
      ) : (
        <Button
          onClick={handleRegister}
          disabled={submitting}
          className="w-fit rounded-[8px] bg-navy text-sm text-white hover:bg-[var(--color-navy-dark)]"
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          {/* Gratuito e lotado ainda aceita: entra na fila, e o botão diz isso
              antes do clique. */}
          {soldOut ? "Entrar na fila de espera" : "Inscrever-se"}
        </Button>
      )}
    </section>
  );
}
