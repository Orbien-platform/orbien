"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import api from "@/lib/api";

export interface CancellableTenant {
  id: string;
  name: string;
}

interface CancelTenantModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancelled: () => void;
  tenant: CancellableTenant | null;
}

// Cancelar grava `tenant_plans.cancelled_at`, o marco que os jobs de retenção
// (CONF-02) usam para contar 5 anos do dado financeiro e 30 dias do de menor.
// Por isso a confirmação pede o nome do tenant: o efeito não é um clique
// desfeito por outro — reativar limpa o marco, mas a contagem já correu.
export function CancelTenantModal({
  open,
  onOpenChange,
  onCancelled,
  tenant,
}: CancelTenantModalProps) {
  // Remonta com `key={tenant.id}` em quem chama, como os outros modais.
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const confirmed = tenant !== null && typed.trim() === tenant.name;

  function close() {
    if (isSubmitting) return;
    setError("");
    setTyped("");
    onOpenChange(false);
  }

  async function handleConfirm() {
    if (!tenant || !confirmed) return;
    setError("");
    setIsSubmitting(true);
    try {
      await api.post(`/platform/tenants/${tenant.id}/cancel`);
      setIsSubmitting(false);
      setTyped("");
      onOpenChange(false);
      onCancelled();
    } catch {
      setError("Não foi possível cancelar o plano. Tente novamente.");
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={() => close()}
      title="Cancelar plano?"
      description={
        tenant ? `Encerra o contrato de ${tenant.name} com a plataforma.` : undefined
      }
      className="max-w-md"
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-[8px] bg-crimson-dim px-3 py-2.5 text-sm text-crimson">
          <p className="font-medium">Isto inicia a contagem de retenção de dados.</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-4">
            <li>
              A data de hoje vira o fim do contrato. Dados de menores de 18 anos
              são anonimizados 30 dias depois; dados financeiros de doadores, 5
              anos depois.
            </li>
            <li>
              Reativar o plano limpa a data, mas não desfaz o que os jobs de
              retenção já tiverem anonimizado.
            </li>
            <li>Cancelar de novo um plano já cancelado não reinicia a contagem.</li>
          </ul>
        </div>

        <label className="flex flex-col gap-1.5 text-sm text-ink dark:text-white">
          <span>
            Para confirmar, digite{" "}
            <span className="font-medium">{tenant?.name}</span>
          </span>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={isSubmitting}
            autoComplete="off"
            aria-label="Nome do tenant para confirmar"
          />
        </label>

        {error && (
          <p
            className="rounded-[8px] bg-crimson-dim px-3 py-2 text-sm text-crimson"
            role="alert"
          >
            {error}
          </p>
        )}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            disabled={isSubmitting}
            className="rounded-[8px] px-3 py-2 text-sm font-medium text-stone transition-colors hover:bg-[var(--surface-subtle)] hover:text-ink dark:hover:text-white disabled:opacity-60"
          >
            Voltar
          </button>
          <Button
            onClick={handleConfirm}
            disabled={!confirmed || isSubmitting}
            className="h-9 rounded-[8px] bg-crimson px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={15} className="mr-2 animate-spin" />
                Cancelando…
              </>
            ) : (
              "Cancelar plano"
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
