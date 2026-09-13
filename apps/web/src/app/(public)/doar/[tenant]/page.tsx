"use client";

import { useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import axios from "axios";
import { Check, Copy, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

/**
 * Doação pública (Cenário 3 do PIX, PROD-04) — sem login, um tenant por
 * link (`/doar/<slug>`). `POST /financial/pix/public-donation` já existe e é
 * público; esta página só faltava. `pix_key` aqui é a chave manual cadastrada
 * em `BrandingConfig`, não um QR Code Asaas (isso é o Cenário 2, Premium) —
 * por isso o resultado é "copie a chave e pague no seu banco", não um QR.
 */

interface DonationResult {
  pix_key: string;
  amount: number;
  church_name: string;
  transaction_ref: string;
}

function formatBRL(amount: number): string {
  return amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function DoacaoPublicaPage() {
  const params = useParams<{ tenant: string }>();
  const tenantSlug = params.tenant;

  const [amount, setAmount] = useState("");
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — deve ficar vazio
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<DonationResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const parsedAmount = Number(amount.replace(",", "."));
    if (!parsedAmount || parsedAmount <= 0) {
      setError("Informe um valor válido para a doação.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data } = await api.post<DonationResult>("/financial/pix/public-donation", {
        tenant_slug: tenantSlug,
        amount: parsedAmount,
        ...(donorName.trim() ? { donor_name: donorName.trim() } : {}),
        ...(donorEmail.trim() ? { donor_email: donorEmail.trim() } : {}),
        ...(website.trim() ? { website: website.trim() } : {}),
      });
      setResult(data);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (!err.response) {
          setError("Não foi possível conectar. Verifique sua internet.");
        } else if (err.response.status === 404) {
          setError("Igreja não encontrada. Confira o link recebido.");
        } else if (err.response.status === 429) {
          setError("Muitas tentativas em pouco tempo. Aguarde um momento e tente de novo.");
        } else {
          setError("Não foi possível gerar a doação agora. Tente novamente.");
        }
      } else {
        setError("Não foi possível conectar. Verifique sua internet.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.pix_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard indisponível (ex.: contexto não seguro) — a chave já está
      // visível na tela para copiar à mão.
    }
  }

  if (result) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-parchment)] px-4">
        <div className="w-full max-w-[420px] rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] p-8 text-center shadow-[var(--shadow-md)]">
          <h1 className="font-sans text-lg font-medium text-ink dark:text-white">
            Obrigado pela sua doação!
          </h1>
          <p className="mt-1 text-sm text-stone">{result.church_name}</p>

          <p className="mt-6 text-2xl font-medium text-navy">{formatBRL(result.amount)}</p>
          <p className="mt-1 text-xs text-muted-text">Ref. {result.transaction_ref}</p>

          <div className="mt-6 flex flex-col gap-1.5 text-left">
            <Label className="text-sm font-medium text-ink dark:text-white">
              Chave PIX para pagamento
            </Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-subtle)] px-3 py-2 text-sm text-ink dark:text-white">
                {result.pix_key}
              </code>
              <Button
                type="button"
                onClick={handleCopy}
                className="h-10 shrink-0 rounded-[8px] bg-navy px-3 text-white hover:bg-[var(--color-navy-dark)]"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </Button>
            </div>
            <p className="mt-1 text-xs text-stone">
              Copie a chave acima e finalize o PIX pelo aplicativo do seu banco.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-parchment)] px-4">
      <div className="w-full max-w-[400px]">
        <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] p-8 shadow-[var(--shadow-md)]">
          <div className="mb-8">
            <h1 className="font-sans text-2xl font-medium text-navy">orbien</h1>
            <p className="mt-1 text-sm font-light text-stone">Fazer uma doação</p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amount" className="text-sm font-medium text-ink dark:text-white">
                Valor (R$)
              </Label>
              <Input
                id="amount"
                type="text"
                inputMode="decimal"
                placeholder="ex: 100,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isSubmitting}
                className="rounded-[8px]"
              />
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

            {/* Honeypot anti-spam: campo escondido de humanos, visível a bots. */}
            <div className="hidden" aria-hidden="true">
              <label htmlFor="website">Não preencha este campo</label>
              <input
                id="website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>

            {error && (
              <p className="rounded-[8px] bg-crimson-dim px-3 py-2 text-sm text-crimson" role="alert">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={isSubmitting}
              className="mt-1 h-10 w-full rounded-[8px] bg-navy font-sans text-sm font-medium text-white hover:bg-[var(--color-navy-dark)] disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Gerando…
                </>
              ) : (
                "Doar"
              )}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-text">
          Orbien · Gestão de igrejas
        </p>
      </div>
    </div>
  );
}
