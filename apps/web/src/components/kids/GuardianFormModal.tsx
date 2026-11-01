"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/Modal";
import { apiErrorMessage } from "@/lib/api-error";
import { addGuardian, updateGuardian, type KidsGuardian } from "@/lib/kids";

interface GuardianFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  childId: string;
  /** `null` adiciona um terceiro autorizado; um responsável edita o vínculo dele. */
  guardian: KidsGuardian | null;
  onSaved: () => void;
}

/**
 * Terceiro autorizado (avó, vizinho…) ou ajuste de um vínculo. Quem é a pessoa
 * não muda numa edição — para trocar, remove e adiciona. A API garante ao menos
 * um responsável primário que possa retirar.
 */
export function GuardianFormModal({ open, onOpenChange, childId, guardian, onSaved }: GuardianFormModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState(guardian?.relationship ?? "");
  const [canPickup, setCanPickup] = useState(guardian?.can_pickup ?? true);
  const [isPrimary, setIsPrimary] = useState(guardian?.is_primary ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = relationship.trim() !== "" && (guardian !== null || (name.trim() !== "" && phone.trim() !== ""));

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      if (guardian) {
        await updateGuardian(guardian.id, {
          relationship: relationship.trim(),
          can_pickup: canPickup,
          is_primary: isPrimary,
        });
      } else {
        await addGuardian(childId, {
          full_name: name.trim(),
          phone: phone.trim(),
          relationship: relationship.trim(),
          can_pickup: canPickup,
          is_primary: isPrimary,
        });
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, "Não foi possível salvar o responsável."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={guardian ? "Editar responsável" : "Autorizar uma pessoa"}
      description={guardian?.full_name}
    >
      <div className="flex flex-col gap-3">
        {guardian ? null : (
          <>
            <div className="flex flex-col gap-1">
              <Label htmlFor="g-name" className="text-sm font-medium text-ink dark:text-white">
                Nome
              </Label>
              <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} className="rounded-[8px]" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="g-phone" className="text-sm font-medium text-ink dark:text-white">
                Telefone
              </Label>
              <Input
                id="g-phone"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={busy}
                className="rounded-[8px]"
              />
            </div>
          </>
        )}
        <div className="flex flex-col gap-1">
          <Label htmlFor="g-rel" className="text-sm font-medium text-ink dark:text-white">
            Parentesco
          </Label>
          <Input
            id="g-rel"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            disabled={busy}
            placeholder="ex: avó, vizinha, tio"
            className="rounded-[8px]"
          />
        </div>
        <label className="flex items-start gap-2 text-sm text-ink dark:text-white">
          <input
            type="checkbox"
            checked={canPickup}
            onChange={(e) => setCanPickup(e.target.checked)}
            disabled={busy}
            className="mt-0.5 accent-[var(--brand)]"
          />
          <span>
            Pode buscar a criança
            <span className="block text-xs text-stone">Só quem pode buscar tem a retirada aceita com o código.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-ink dark:text-white">
          <input
            type="checkbox"
            checked={isPrimary}
            onChange={(e) => setIsPrimary(e.target.checked)}
            disabled={busy}
            className="mt-0.5 accent-[var(--brand)]"
          />
          <span>
            Responsável primário
            <span className="block text-xs text-stone">Recebe o aviso “Criança entregue”. A criança sempre tem um.</span>
          </span>
        </label>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-crimson">
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          disabled={busy}
          className="rounded-[8px] px-3 py-1.5 text-sm text-stone hover:bg-[var(--surface-subtle)]"
        >
          Voltar
        </button>
        <Button
          type="button"
          onClick={save}
          disabled={busy || !valid}
          className="flex items-center gap-1.5 rounded-[8px] bg-navy px-3 py-1.5 text-sm text-white hover:bg-navy/90 disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : null}
          {guardian ? "Salvar responsável" : "Autorizar pessoa"}
        </Button>
      </div>
    </Modal>
  );
}
