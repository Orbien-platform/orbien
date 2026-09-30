"use client";

import { useState } from "react";
import { Check, Copy, Loader2, QrCode } from "lucide-react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NoAccessState } from "@/components/ui/NoAccessState";
import api, { isForbidden } from "@/lib/api";
import { formatInstant } from "@/lib/datetime";
import { DonorPicker, type DonorOption } from "./DonorPicker";

interface DynamicPix {
  payment_id: string;
  qr_code: string;
  qr_code_image: string;
  amount: number;
  expires_at: string;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(n);
}

/**
 * QR dinâmico do tesoureiro (Cenário 2, Premium — `POST /financial/pix/dynamic`).
 * A Asaas devolve a imagem sem o prefixo de data URI; quem monta é esta tela.
 * Doador é opcional: identificado, a confirmação do PIX emite o recibo.
 */
export function DynamicPixPanel() {
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState("");
  const [donor, setDonor] = useState<DonorOption | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);
  const [pix, setPix] = useState<DynamicPix | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (amount <= 0) {
      setError("Informe um valor maior que zero.");
      return;
    }
    setError("");
    setSubmitting(true);
    setCopied(false);
    try {
      const res = await api.post<DynamicPix>("/financial/pix/dynamic", {
        amount,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(donor ? { donor_person_id: donor.id } : {}),
      });
      setPix(res.data);
    } catch (err) {
      if (isForbidden(err)) {
        setAccessDenied(true);
      } else if (axios.isAxiosError(err) && err.response?.status === 400) {
        setError(String(err.response.data?.message ?? "Dados inválidos."));
      } else {
        setError("Não foi possível gerar o QR. Tente de novo.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function copyCode() {
    if (!pix) return;
    try {
      await navigator.clipboard.writeText(pix.qr_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Não foi possível copiar. Selecione o código e copie manualmente.");
    }
  }

  function reset() {
    setPix(null);
    setAmount(0);
    setDescription("");
    setDonor(null);
    setError("");
  }

  if (accessDenied) {
    return (
      <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)]">
        <NoAccessState resource="PIX com QR Code" />
      </div>
    );
  }

  return (
    <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)] p-4">
      <p className="text-sm font-medium text-ink dark:text-white">Cobrar com QR Code</p>
      <p className="mt-0.5 text-xs text-stone">
        Gera um PIX de valor fechado para mostrar na hora, no culto ou no balcão.
      </p>

      {pix ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/png;base64,${pix.qr_code_image}`}
              alt={`QR Code do PIX de ${fmt(pix.amount)}`}
              width={176}
              height={176}
              className="rounded-[8px] border border-[var(--border-default)] bg-white p-2"
            />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-2xl font-medium tabular-nums text-ink dark:text-white">{fmt(pix.amount)}</p>
              <p className="text-xs text-stone">
                Vale até{" "}
                {formatInstant(pix.expires_at, {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              <label className="block text-xs text-stone" htmlFor="pix-copia-e-cola">
                Copia e cola
              </label>
              <textarea
                id="pix-copia-e-cola"
                readOnly
                rows={3}
                value={pix.qr_code}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full resize-none break-all rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] p-2 font-mono text-xs text-ink dark:text-white"
              />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1.5 rounded-[8px]" onClick={copyCode}>
                  {copied ? <Check size={13} strokeWidth={1.5} /> : <Copy size={13} strokeWidth={1.5} />}
                  {copied ? "Copiado" : "Copiar código"}
                </Button>
                <Button variant="outline" size="sm" className="rounded-[8px]" onClick={reset}>
                  Nova cobrança
                </Button>
              </div>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-xs text-crimson">
              {error}
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pix-dynamic-amount">Valor</Label>
            <CurrencyInput id="pix-dynamic-amount" value={amount} onValueChange={setAmount} disabled={submitting} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pix-dynamic-description">Descrição (opcional)</Label>
            <Input
              id="pix-dynamic-description"
              value={description}
              disabled={submitting}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pix-dynamic-donor">Doador (opcional)</Label>
            <DonorPicker id="pix-dynamic-donor" value={donor} onChange={setDonor} disabled={submitting} />
            <p className="text-xs text-stone">Com doador, a confirmação do PIX emite o recibo em nome dele.</p>
          </div>
          {error && (
            <p role="alert" className="text-xs text-crimson sm:col-span-2">
              {error}
            </p>
          )}
          <div className="sm:col-span-2">
            <Button
              type="submit"
              size="sm"
              disabled={submitting}
              className="gap-1.5 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)]"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <QrCode size={14} strokeWidth={1.5} />}
              Gerar QR Code
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
