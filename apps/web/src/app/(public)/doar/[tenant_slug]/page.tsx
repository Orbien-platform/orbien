"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { Check, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { PixQrBlock } from "@/components/public/PixQrBlock";
import { usePaymentStatus } from "@/hooks/usePaymentStatus";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import axios from "axios";

/**
 * `static` é a chave para copiar (Starter, e o Premium quando o QR não está
 * disponível); `dynamic` é o QR que a igreja reconhece sozinha (Premium). Sem
 * `mode` — resposta anterior da API — vale `static`.
 */
interface DonationResult {
  mode?: "static" | "dynamic";
  pix_key: string;
  amount: number;
  church_name: string;
  transaction_ref: string;
  fallback_reason?: "provider_unavailable" | "cap_reached";
  payment_id?: string;
  qr_code?: string;
  qr_code_image?: string;
  expires_at?: string;
}

/** Limites da Asaas por cobrança — o servidor valida de novo. */
const MIN_AMOUNT = 5;
const MAX_AMOUNT = 50_000;

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

const storageKey = (slug: string) => `orbien:doar:${slug}`;

/**
 * O QR só existe na resposta do POST: recarregar a página, ou voltar do app do
 * banco, o perderia com a cobrança ainda válida. Fica em `sessionStorage` (some
 * ao fechar a aba) e só enquanto a validade não passou. Storage pode estar
 * bloqueado ou vazio — qualquer falha vira "sem QR guardado".
 */
function readSaved(slug: string): DonationResult | null {
  try {
    const raw = sessionStorage.getItem(storageKey(slug));
    if (!raw) return null;
    const saved = JSON.parse(raw) as DonationResult;
    const valid =
      saved.mode === "dynamic" &&
      !!saved.payment_id &&
      !!saved.expires_at &&
      new Date(saved.expires_at).getTime() > Date.now();
    if (!valid) sessionStorage.removeItem(storageKey(slug));
    return valid ? saved : null;
  } catch {
    return null;
  }
}

function writeSaved(slug: string, result: DonationResult) {
  try {
    sessionStorage.setItem(storageKey(slug), JSON.stringify(result));
  } catch {
    // Sem storage a doação funciona igual; só não sobrevive a um recarregamento.
  }
}

function clearSaved(slug: string) {
  try {
    sessionStorage.removeItem(storageKey(slug));
  } catch {
    // idem
  }
}

/** Chave PIX estática com botão de copiar — Starter, fallback e alternativa ao QR. */
function PixKeyField({ pixKey }: { pixKey: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(pixKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="pix-key" className="text-sm font-medium text-ink dark:text-white">
        Chave PIX
      </Label>
      <div className="flex items-center gap-2">
        <Input id="pix-key" readOnly value={pixKey} className="rounded-[8px] font-mono text-sm" />
        <Button type="button" variant="outline" onClick={handleCopy} className="h-8 shrink-0">
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>
    </div>
  );
}

export default function DoarPage() {
  const params = useParams<{ tenant_slug: string }>();
  const tenantSlug = params.tenant_slug;

  const [amount, setAmount] = useState(0);
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot anti-spam — mantido vazio por humanos
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");
  const [result, setResult] = useState<DonationResult | null>(null);

  const dynamic = result?.mode === "dynamic" ? result : null;
  const isDynamic = dynamic !== null;
  const status = usePaymentStatus(
    tenantSlug,
    dynamic?.payment_id ?? null,
    dynamic?.expires_at ?? null,
  );

  // Retoma o QR guardado depois da hidratação (o servidor não tem sessionStorage).
  useEffect(() => {
    const saved = readSaved(tenantSlug);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lê storage do navegador, que não existe no SSR
    if (saved) setResult(saved);
  }, [tenantSlug]);

  // Pago ou vencido: o QR guardado não serve mais.
  useEffect(() => {
    if (status !== "pending") clearSaved(tenantSlug);
  }, [status, tenantSlug]);

  const outOfRange = amount > 0 && (amount < MIN_AMOUNT || amount > MAX_AMOUNT);
  const rangeHint =
    amount > MAX_AMOUNT
      ? `O valor máximo é ${formatAmount(MAX_AMOUNT)}`
      : `O valor mínimo é ${formatAmount(MIN_AMOUNT)}`;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (amount < MIN_AMOUNT || amount > MAX_AMOUNT) return;

    setApiError("");
    setIsSubmitting(true);
    try {
      const { data } = await api.post<DonationResult>("/financial/pix/public-donation", {
        tenant_slug: tenantSlug,
        amount,
        donor_name: donorName.trim() || undefined,
        donor_email: donorEmail.trim() || undefined,
        website: website || undefined,
      });
      if (data.mode === "dynamic") writeSaved(tenantSlug, data);
      setResult(data);
    } catch (err: unknown) {
      const fallback = "Não foi possível gerar a doação agora. Tente novamente.";
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setApiError("Igreja não encontrada. Confira o link recebido.");
      } else if (axios.isAxiosError(err) && err.response?.status === 429) {
        setApiError("Muitas tentativas seguidas. Aguarde um minuto e tente de novo.");
      } else {
        setApiError(apiErrorMessage(err, fallback));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  /** Volta ao formulário. `keepAmount`: o QR venceu e o doador quer o mesmo valor. */
  function backToForm(keepAmount: boolean) {
    clearSaved(tenantSlug);
    if (!keepAmount) setAmount(0);
    setApiError("");
    setResult(null);
  }

  const confirmed = isDynamic && status === "confirmed";
  const expired = isDynamic && status === "expired";
  const waiting = isDynamic && status === "pending";

  let subtitle = "Contribua via PIX";
  if (confirmed) subtitle = "Doação recebida";
  else if (expired) subtitle = "O QR code venceu";
  else if (waiting) subtitle = "Pague com o QR code";
  else if (result) subtitle = "Chave PIX para a sua doação";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-parchment)] px-4">
      <div className="w-full max-w-[400px]">
        <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] p-8 shadow-[var(--shadow-md)]">
          <div className="mb-8">
            <h1 className="font-sans text-2xl font-medium text-navy">
              {result ? result.church_name : "Doação"}
            </h1>
            <p className="mt-1 text-sm font-light text-stone">{subtitle}</p>
          </div>

          {confirmed && dynamic ? (
            /* ── Pago: o webhook da Asaas confirmou ── */
            <div className="flex flex-col gap-4" role="status">
              <Check size={40} strokeWidth={1.5} className="mx-auto text-teal" />
              <p className="text-center text-sm text-ink dark:text-white">
                Recebemos sua doação de {formatAmount(dynamic.amount)}. Que Deus abençoe você!
              </p>
              <p className="text-center text-xs text-muted-text">Referência: {dynamic.transaction_ref}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => backToForm(false)}
                className="h-10 w-full rounded-[8px]"
              >
                Fazer outra doação
              </Button>
            </div>
          ) : expired && dynamic ? (
            /* ── QR vencido ── */
            <div className="flex flex-col gap-4">
              <p className="text-sm text-ink dark:text-white">
                O QR code de {formatAmount(dynamic.amount)} passou da validade e não recebe mais
                pagamentos. Gere um novo para continuar.
              </p>
              <Button
                type="button"
                onClick={() => backToForm(true)}
                className="h-10 w-full rounded-[8px] bg-navy font-sans text-sm font-medium text-white hover:bg-[var(--color-navy-dark)]"
              >
                Gerar novo QR code
              </Button>
            </div>
          ) : waiting && dynamic?.qr_code && dynamic.qr_code_image && dynamic.expires_at ? (
            /* ── QR dinâmico, esperando o pagamento ── */
            <div className="flex flex-col gap-5">
              <PixQrBlock
                qrCodeImage={dynamic.qr_code_image}
                qrCode={dynamic.qr_code}
                amount={dynamic.amount}
                expiresAt={dynamic.expires_at}
              />

              <p
                role="status"
                className="flex items-center justify-center gap-2 text-sm text-stone"
              >
                <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                Aguardando o pagamento
              </p>

              <details className="group">
                <summary className="cursor-pointer text-sm text-stone underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2">
                  Prefere copiar a chave PIX?
                </summary>
                <div className="mt-3">
                  <PixKeyField pixKey={dynamic.pix_key} />
                </div>
              </details>

              <p className="text-center text-xs text-muted-text">Referência: {dynamic.transaction_ref}</p>
            </div>
          ) : result ? (
            /* ── Chave estática ── */
            <div className="flex flex-col gap-4">
              {result.fallback_reason ? (
                <p className="rounded-[8px] bg-[var(--surface-parchment)] px-3 py-2 text-sm text-ink dark:text-white" role="status">
                  O QR code não está disponível agora. Use a chave abaixo no app do seu banco.
                </p>
              ) : (
                <>
                  <Check size={40} strokeWidth={1.5} className="mx-auto text-teal" />
                  <p className="text-center text-sm text-ink dark:text-white">
                    Doação de {formatAmount(result.amount)} registrada. Use a chave
                    abaixo no app do seu banco para concluir o PIX.
                  </p>
                </>
              )}

              {result.fallback_reason && (
                <p className="text-center text-sm text-ink dark:text-white">
                  Valor: {formatAmount(result.amount)}
                </p>
              )}

              <PixKeyField pixKey={result.pix_key} />

              <p className="text-center text-xs text-muted-text">
                Referência: {result.transaction_ref}
              </p>
            </div>
          ) : (
            /* ── Form ── */
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="amount" className="text-sm font-medium text-ink dark:text-white">
                  Valor
                </Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-stone">
                    R$
                  </span>
                  <CurrencyInput
                    id="amount"
                    value={amount}
                    onValueChange={setAmount}
                    disabled={isSubmitting}
                    className="rounded-[8px] pl-9"
                  />
                </div>
                {outOfRange && (
                  <p className="text-xs text-crimson" role="alert">
                    {rangeHint}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="donor_name" className="text-sm font-medium text-ink dark:text-white">
                  Seu nome (opcional)
                </Label>
                <Input
                  id="donor_name"
                  type="text"
                  placeholder="Como quer ser identificado"
                  value={donorName}
                  onChange={(e) => setDonorName(e.target.value)}
                  autoComplete="name"
                  disabled={isSubmitting}
                  className="rounded-[8px]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="donor_email" className="text-sm font-medium text-ink dark:text-white">
                  E-mail (opcional)
                </Label>
                <Input
                  id="donor_email"
                  type="email"
                  placeholder="seu@email.com"
                  value={donorEmail}
                  onChange={(e) => setDonorEmail(e.target.value)}
                  autoComplete="email"
                  disabled={isSubmitting}
                  className="rounded-[8px]"
                />
              </div>

              {/* Honeypot anti-spam — invisível para humanos */}
              <input
                type="text"
                name="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="absolute left-[-9999px] h-0 w-0 opacity-0"
              />

              {apiError && (
                <div className="rounded-[8px] bg-crimson-dim px-3 py-2" role="alert">
                  <p className="text-sm text-crimson">{apiError}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={isSubmitting || amount < MIN_AMOUNT || amount > MAX_AMOUNT}
                className="mt-1 h-10 w-full rounded-[8px] bg-navy font-sans text-sm font-medium text-white hover:bg-[var(--color-navy-dark)] disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    Gerando…
                  </>
                ) : (
                  "Continuar"
                )}
              </Button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-text">
          Orbien · Gestão de igrejas
        </p>
      </div>
    </div>
  );
}
