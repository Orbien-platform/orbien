"use client";

import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatInstant } from "@/lib/datetime";

interface PixQrBlockProps {
  /** PNG em base64, sem o prefixo `data:` — é como a Asaas devolve. */
  qrCodeImage: string;
  /** Código "copia e cola" do PIX. */
  qrCode: string;
  amount: number;
  /** ISO. Mostrado como "válido até" — não é o prazo da Asaas, é o da página. */
  expiresAt: string;
}

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * QR + copia-e-cola da doação pública. O valor vem em destaque porque é a
 * única coisa que o doador confere antes de pagar no app do banco.
 *
 * O QR fica sempre sobre fundo branco: leitor de câmera não lê QR invertido,
 * então o tema escuro não pode tingir a área do código.
 */
export function PixQrBlock({ qrCodeImage, qrCode, amount, expiresAt }: PixQrBlockProps) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(qrCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sem permissão de área de transferência (HTTP, iframe): deixa o código
      // selecionado para o doador copiar com o sistema.
      inputRef.current?.select();
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-3xl font-medium tabular-nums text-navy">{formatAmount(amount)}</p>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`data:image/png;base64,${qrCodeImage}`}
        alt={`QR Code do PIX de ${formatAmount(amount)}`}
        width={208}
        height={208}
        className="rounded-[8px] border border-[var(--border-default)] bg-white p-2"
      />

      <p className="text-xs text-stone">
        Válido até{" "}
        {formatInstant(expiresAt, {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>

      <div className="flex w-full flex-col gap-1.5">
        <Label htmlFor="pix-copia-e-cola" className="text-sm font-medium text-ink dark:text-white">
          PIX copia e cola
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id="pix-copia-e-cola"
            ref={inputRef}
            readOnly
            value={qrCode}
            onFocus={(e) => e.currentTarget.select()}
            className="rounded-[8px] font-mono text-xs"
          />
          <Button type="button" variant="outline" onClick={handleCopy} className="h-8 shrink-0">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copiado" : "Copiar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
