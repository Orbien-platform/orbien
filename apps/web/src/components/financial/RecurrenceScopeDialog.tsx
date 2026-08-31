"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type RecurrenceScope = "this" | "this_and_future";

interface RecurrenceScopeDialogProps {
  open: boolean;
  mode: "edit" | "delete";
  isSubmitting?: boolean;
  onCancel: () => void;
  onConfirm: (scope: RecurrenceScope) => void;
}

export function RecurrenceScopeDialog({
  open,
  mode,
  isSubmitting = false,
  onCancel,
  onConfirm,
}: RecurrenceScopeDialogProps) {
  const [scope, setScope] = useState<RecurrenceScope>("this");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-[12px] bg-[var(--surface-card)] p-5">
        <p className="text-sm font-medium text-ink dark:text-white">
          {mode === "edit" ? "Alterar lançamento recorrente" : "Excluir lançamento recorrente"}
        </p>
        <p className="mt-1.5 text-sm text-stone">
          Este lançamento faz parte de uma série. O que deseja alterar?
        </p>

        <div className="mt-3 flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-ink dark:text-white">
            <input
              type="radio"
              name="recurrence-scope"
              checked={scope === "this"}
              onChange={() => setScope("this")}
              disabled={isSubmitting}
            />
            Somente este lançamento
          </label>
          <label className="flex items-center gap-2 text-sm text-ink dark:text-white">
            <input
              type="radio"
              name="recurrence-scope"
              checked={scope === "this_and_future"}
              onChange={() => setScope("this_and_future")}
              disabled={isSubmitting}
            />
            Este e os próximos
          </label>
        </div>

        <div className="mt-4 flex gap-2">
          <Button
            variant="outline"
            className="flex-1 rounded-[8px]"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            className={cn(
              "flex-1 rounded-[8px] text-white hover:opacity-90",
              mode === "delete" ? "bg-crimson" : "bg-navy"
            )}
            onClick={() => onConfirm(scope)}
            disabled={isSubmitting}
          >
            {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : "Confirmar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
