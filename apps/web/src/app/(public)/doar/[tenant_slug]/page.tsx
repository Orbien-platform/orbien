"use client";

import { useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { Check, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import api from "@/lib/api";
import axios from "axios";

interface DonationResult {
  pix_key: string;
  amount: number;
  church_name: string;
  transaction_ref: string;
}

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
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
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (amount <= 0) return;

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
      setResult(data);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setApiError("Igreja não encontrada. Confira o link recebido.");
      } else if (axios.isAxiosError(err) && err.response?.status === 400) {
        setApiError("Esta igreja ainda não configurou doação por PIX.");
      } else {
        setApiError("Não foi possível gerar a doação agora. Tente novamente.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.pix_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-parchment)] px-4">
      <div className="w-full max-w-[400px]">
        <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] p-8 shadow-[var(--shadow-md)]">
          <div className="mb-8">
            <h1 className="font-sans text-2xl font-medium text-navy">
              {result ? result.church_name : "Doação"}
            </h1>
            <p className="mt-1 text-sm font-light text-stone">
              {result ? "Chave PIX para a sua doação" : "Contribua via PIX"}
            </p>
          </div>

          {result ? (
            /* ── Success state ── */
            <div className="flex flex-col gap-4">
              <Check size={40} strokeWidth={1.5} className="mx-auto text-teal" />
              <p className="text-center text-sm text-ink dark:text-white">
                Doação de {formatAmount(result.amount)} registrada. Use a chave
                abaixo no app do seu banco para concluir o PIX.
              </p>

              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-medium text-ink dark:text-white">
                  Chave PIX
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={result.pix_key}
                    className="rounded-[8px] font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCopy}
                    className="h-8 shrink-0"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? "Copiado" : "Copiar"}
                  </Button>
                </div>
              </div>

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
                disabled={isSubmitting || amount <= 0}
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
