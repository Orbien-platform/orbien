"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Person {
  id: string;
  full_name: string;
}

export interface NetworkFormValues {
  id: string | null;
  name: string;
  leader_person_id: string | null;
  health_goal_pct: number | null;
}

interface NetworkFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  network: NetworkFormValues | null;
  onSaved: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

// Criação/edição de Network (PROD-20, CEL20-07): mesmo padrão de
// CreateGroupModal — formulário controlado, líder buscado de /persons.
// `network` só é lido para o valor INICIAL destes estados — o pai
// (`RedesPage`) troca a `key` do componente a cada abertura (nova rede ou
// edição de uma rede diferente), o que remonta este componente com um
// estado limpo. Sem isso, um `useEffect` sincronizando `network` → estado
// local cairia na regra `react-hooks/set-state-in-effect` (setState síncrono
// no corpo do effect) — o mesmo problema que `GroupChatPanel` evita com
// estado "carregando" derivado.
export function NetworkFormModal({ open, onOpenChange, network, onSaved }: NetworkFormModalProps) {
  const [name, setName] = useState(network?.name ?? "");
  const [leaderId, setLeaderId] = useState(network?.leader_person_id ?? "");
  const [goalPct, setGoalPct] = useState(
    network?.health_goal_pct != null ? String(network.health_goal_pct) : "",
  );
  const [persons, setPersons] = useState<Person[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const hasFetched = useRef(false);

  const isEdit = network?.id != null;

  const loadPersons = useCallback(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    api
      .get<{ data: Person[]; total: number }>("/persons?limit=100")
      .then((r) => setPersons(r.data.data ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open) loadPersons();
  }, [open, loadPersons]);

  function reset() {
    setError("");
    hasFetched.current = false;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("Nome é obrigatório."); return; }

    const trimmedGoal = goalPct.trim();
    let health_goal_pct: number | undefined;
    if (trimmedGoal) {
      const parsed = Number(trimmedGoal);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
        setError("Meta deve ser um número inteiro entre 0 e 100.");
        return;
      }
      health_goal_pct = parsed;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        leader_person_id: leaderId || undefined,
        health_goal_pct,
      };
      if (isEdit && network?.id) {
        await api.patch(`/networks/${network.id}`, payload);
      } else {
        await api.post("/networks", payload);
      }
      onSaved();
      onOpenChange(false);
      reset();
    } catch {
      setError(isEdit ? "Erro ao atualizar rede." : "Erro ao criar rede.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}
      title={isEdit ? "Editar rede" : "Nova rede"}
      description="Agrupe células e defina uma meta de saúde."
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="net-name" className="text-sm font-medium text-ink dark:text-white">
            Nome <span className="text-crimson">*</span>
          </Label>
          <Input
            id="net-name"
            placeholder="ex: Rede Zona Sul"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
            className="rounded-[8px]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="net-leader" className="text-sm font-medium text-ink dark:text-white">
            Líder de rede <span className="text-xs font-normal text-stone">(opcional)</span>
          </Label>
          <select
            id="net-leader"
            value={leaderId}
            onChange={(e) => setLeaderId(e.target.value)}
            disabled={isSubmitting}
            className="h-9 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
          >
            <option value="">— Sem líder definido —</option>
            {persons.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="net-goal" className="text-sm font-medium text-ink dark:text-white">
            Meta de saúde (%) <span className="text-xs font-normal text-stone">(opcional)</span>
          </Label>
          <Input
            id="net-goal"
            type="number"
            min={0}
            max={100}
            placeholder="ex: 80"
            value={goalPct}
            onChange={(e) => setGoalPct(e.target.value)}
            disabled={isSubmitting}
            className="rounded-[8px]"
          />
        </div>

        {error && (
          <p className="rounded-[8px] bg-crimson-dim px-3 py-2 text-sm text-crimson" role="alert">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            className="flex-1 rounded-[8px]"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)]"
          >
            {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : "Salvar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
