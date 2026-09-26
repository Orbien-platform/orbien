"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

export interface PlanEditableTenant {
  id: string;
  name: string;
  plan: "starter" | "premium" | null;
}

interface ChangePlanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
  tenant: PlanEditableTenant | null;
}

const PLANS: { value: "starter" | "premium"; label: string; description: string }[] = [
  { value: "starter", label: "Starter", description: "Plano de entrada." },
  { value: "premium", label: "Premium", description: "Plano completo." },
];

export function ChangePlanModal({
  open,
  onOpenChange,
  onChanged,
  tenant,
}: ChangePlanModalProps) {
  // Remonta com `key={tenant.id}` em quem chama — mesmo desenho do
  // `EditTenantModal`, pelo mesmo motivo: sem isso a seleção de um tenant
  // vazaria para o próximo aberto.
  const [selected, setSelected] = useState<"starter" | "premium" | null>(
    tenant?.plan ?? null
  );
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function close() {
    setError("");
    onOpenChange(false);
  }

  async function handleConfirm() {
    if (!tenant || !selected) return;
    setError("");

    if (selected === tenant.plan) {
      close();
      return;
    }

    setIsSubmitting(true);
    try {
      await api.patch(`/platform/tenants/${tenant.id}/plan`, { plan: selected });
      close();
      onChanged();
    } catch {
      setError("Não foi possível mudar o plano. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={() => close()}
      title="Mudar plano"
      description={tenant ? `Plano contratado por ${tenant.name}.` : undefined}
      className="max-w-lg"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          {PLANS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setSelected(p.value)}
              disabled={isSubmitting}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded-[8px] border px-3 py-2.5 text-left transition-colors disabled:opacity-60",
                selected === p.value
                  ? "border-navy bg-navy-dim"
                  : "border-[var(--border-default)] hover:bg-[var(--surface-subtle)]"
              )}
            >
              <span className="text-sm font-medium text-ink dark:text-white">
                {p.label}
                {tenant?.plan === p.value && (
                  <span className="ml-2 text-xs font-normal text-stone">Atual</span>
                )}
              </span>
              <span className="text-xs text-stone">{p.description}</span>
            </button>
          ))}
        </div>

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
            Cancelar
          </button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting || !selected}
            className="h-9 rounded-[8px] bg-navy px-4 text-sm font-medium text-white hover:bg-[var(--color-navy-dark)] disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={15} className="mr-2 animate-spin" />
                Salvando…
              </>
            ) : (
              "Salvar"
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
