"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/Modal";
import { apiErrorMessage } from "@/lib/api-error";
import { createRoom, updateRoom, type KidsRoom } from "@/lib/kids";

type Unit = "years" | "months";

// A igreja pensa a turma em anos ("2 a 5 anos"); o servidor guarda meses. Em
// anos, "até 5" inclui quem tem 5 anos e 11 meses: o limite é 5×12+11.
function toMonths(unit: Unit, from: number, to: number): { min: number; max: number } {
  return unit === "years" ? { min: from * 12, max: (to + 1) * 12 - 1 } : { min: from, max: to };
}

function initialFields(room: KidsRoom | null): { unit: Unit; from: string; to: string } {
  if (!room) return { unit: "years", from: "", to: "" };
  const wholeYears = room.min_age_months % 12 === 0 && (room.max_age_months + 1) % 12 === 0;
  return wholeYears
    ? { unit: "years", from: String(room.min_age_months / 12), to: String((room.max_age_months + 1) / 12 - 1) }
    : { unit: "months", from: String(room.min_age_months), to: String(room.max_age_months) };
}

const asInt = (v: string): number | null => (/^\d+$/.test(v.trim()) ? Number(v) : null);

interface RoomFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` cria; uma turma edita. */
  room: KidsRoom | null;
  onSaved: () => void;
}

/** Criar e editar turma. A faixa etária é obrigatória: sem ela não há como validar o check-in. */
export function RoomFormModal({ open, onOpenChange, room, onSaved }: RoomFormModalProps) {
  const start = initialFields(room);
  const [name, setName] = useState(room?.name ?? "");
  const [unit, setUnit] = useState<Unit>(start.unit);
  const [from, setFrom] = useState(start.from);
  const [to, setTo] = useState(start.to);
  const [outOfRange, setOutOfRange] = useState(room?.allows_out_of_range ?? false);
  const [capacity, setCapacity] = useState(room?.capacity != null ? String(room.capacity) : "");
  const [minVolunteers, setMinVolunteers] = useState(String(room?.min_volunteers ?? 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromN = asInt(from);
  const toN = asInt(to);
  const capN = capacity.trim() === "" ? null : asInt(capacity);
  const volN = asInt(minVolunteers);
  const rangeOk = fromN !== null && toN !== null && fromN <= toN;
  const valid = name.trim() !== "" && rangeOk && (capacity.trim() === "" || (capN !== null && capN >= 1)) && volN !== null;

  async function save() {
    if (!valid || fromN === null || toN === null || volN === null) return;
    setBusy(true);
    setError(null);
    const { min, max } = toMonths(unit, fromN, toN);
    const body = {
      name: name.trim(),
      min_age_months: min,
      max_age_months: max,
      allows_out_of_range: outOfRange,
      capacity: capN,
      min_volunteers: volN,
    };
    try {
      if (room) await updateRoom(room.id, body);
      else await createRoom(body);
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, "Não foi possível salvar a turma."));
    } finally {
      setBusy(false);
    }
  }

  const unitLabel = unit === "years" ? "anos" : "meses";

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={room ? "Editar turma" : "Nova turma"}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="room-name" className="text-sm font-medium text-ink dark:text-white">
            Nome da turma
          </Label>
          <Input
            id="room-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            placeholder="ex: Maternal"
            className="rounded-[8px]"
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-ink dark:text-white">Faixa etária</legend>
          <div role="radiogroup" aria-label="Unidade da faixa" className="flex gap-4 text-sm text-stone">
            {(["years", "months"] as const).map((u) => (
              <label key={u} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="room-unit"
                  checked={unit === u}
                  onChange={() => setUnit(u)}
                  disabled={busy}
                  className="accent-[var(--brand)]"
                />
                {u === "years" ? "Em anos" : "Em meses"}
              </label>
            ))}
          </div>
          <div className="flex items-end gap-3">
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="room-from" className="text-xs text-stone">
                De ({unitLabel})
              </Label>
              <Input
                id="room-from"
                inputMode="numeric"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                disabled={busy}
                className="rounded-[8px] font-mono"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="room-to" className="text-xs text-stone">
                Até ({unitLabel})
              </Label>
              <Input
                id="room-to"
                inputMode="numeric"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                disabled={busy}
                className="rounded-[8px] font-mono"
              />
            </div>
          </div>
          {from !== "" && to !== "" && !rangeOk ? (
            <p className="text-xs text-crimson">Informe números inteiros, com o início menor ou igual ao fim.</p>
          ) : (
            <p className="text-xs text-stone">
              {unit === "years" ? "“Até 5” inclui quem tem 5 anos e 11 meses." : "Meses completos de vida."}
            </p>
          )}
        </fieldset>

        <label className="flex items-start gap-2 text-sm text-ink dark:text-white">
          <input
            type="checkbox"
            checked={outOfRange}
            onChange={(e) => setOutOfRange(e.target.checked)}
            disabled={busy}
            className="mt-0.5 accent-[var(--brand)]"
          />
          <span>
            Aceita criança fora da faixa
            <span className="block text-xs text-stone">
              A equipe confirma na hora do check-in. Sem isso, a criança fora da faixa é recusada.
            </span>
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="room-capacity" className="text-sm font-medium text-ink dark:text-white">
              Capacidade
            </Label>
            <Input
              id="room-capacity"
              inputMode="numeric"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              disabled={busy}
              placeholder="Sem limite"
              aria-describedby="room-capacity-hint"
              className="rounded-[8px] font-mono"
            />
            <span id="room-capacity-hint" className="text-xs text-stone">
              Só avisa ao lotar; não bloqueia.
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="room-volunteers" className="text-sm font-medium text-ink dark:text-white">
              Voluntários no mínimo
            </Label>
            <Input
              id="room-volunteers"
              inputMode="numeric"
              value={minVolunteers}
              onChange={(e) => setMinVolunteers(e.target.value)}
              disabled={busy}
              className="rounded-[8px] font-mono"
            />
          </div>
        </div>
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
          {room ? "Salvar turma" : "Criar turma"}
        </Button>
      </div>
    </Modal>
  );
}
