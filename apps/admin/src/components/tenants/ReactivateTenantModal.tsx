"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

export interface ReactivatableTenant {
  id: string;
  name: string;
}

interface ReactivateTenantModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReactivated: () => void;
  tenant: ReactivatableTenant | null;
}

export function ReactivateTenantModal({
  open,
  onOpenChange,
  onReactivated,
  tenant,
}: ReactivateTenantModalProps) {
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function close() {
    if (isSubmitting) return;
    setError("");
    onOpenChange(false);
  }

  async function handleConfirm() {
    if (!tenant) return;
    setError("");
    setIsSubmitting(true);
    try {
      await api.post(`/platform/tenants/${tenant.id}/reactivate`);
      setIsSubmitting(false);
      onOpenChange(false);
      onReactivated();
    } catch {
      setError("Não foi possível reativar o plano. Tente novamente.");
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={() => close()}
      title="Reativar plano?"
      description={
        tenant
          ? `O plano de ${tenant.name} volta a ficar ativo e a data de fim do contrato é limpa. A contagem de retenção deixa de correr, mas dados já anonimizados não voltam.`
          : undefined
      }
      className="max-w-md"
    >
      <div className="flex flex-col gap-4">
        {error && (
          <p
            className="rounded-[10px] bg-crimson-dim px-3 py-2 text-sm text-crimson"
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
            className="rounded-full px-3 py-2 text-sm font-medium text-stone transition-colors hover:bg-[var(--surface-subtle)] hover:text-ink dark:hover:text-white disabled:opacity-60"
          >
            Voltar
          </button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="h-9 rounded-full bg-navy px-4 text-sm font-medium text-white hover:bg-[var(--color-navy-dark)] disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={15} className="mr-2 animate-spin" />
                Reativando…
              </>
            ) : (
              "Reativar plano"
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
