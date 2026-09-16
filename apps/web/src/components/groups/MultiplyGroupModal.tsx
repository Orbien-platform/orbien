"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import axios from "axios";
import { Loader2, CheckCircle2 } from "lucide-react";
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

interface Membership {
  id: string;
  role: string;
  person: { id: string; full_name: string };
}

interface MultiplyGroupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  members: Membership[];
  onMultiplied: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MultiplyGroupModal({
  open,
  onOpenChange,
  groupId,
  members,
  onMultiplied,
}: MultiplyGroupModalProps) {
  const [name, setName] = useState("");
  const [leaderId, setLeaderId] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [persons, setPersons] = useState<Person[]>([]);
  const [personsError, setPersonsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const hasFetched = useRef(false);

  const loadPersons = useCallback(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    setPersonsError(false);
    api
      .get<{ data: Person[]; total: number }>("/persons?limit=100")
      .then((r) => setPersons(r.data.data ?? []))
      .catch(() => setPersonsError(true));
  }, []);

  useEffect(() => {
    if (open) loadPersons();
  }, [open, loadPersons]);

  function reset() {
    setName("");
    setLeaderId("");
    setSelectedMemberIds(new Set());
    setError("");
    setSuccess(false);
    setPersonsError(false);
    hasFetched.current = false;
  }

  function toggleMember(personId: string) {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("Nome é obrigatório."); return; }
    if (!leaderId) { setError("Selecione o novo líder."); return; }

    setIsSubmitting(true);
    try {
      await api.post(`/small-groups/${groupId}/multiply`, {
        name: name.trim(),
        leader_person_id: leaderId,
        member_ids: Array.from(selectedMemberIds),
      });
      setSuccess(true);
      setTimeout(() => {
        onMultiplied();
        onOpenChange(false);
        reset();
      }, 1200);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 400) {
        setError(err.response.data?.message ?? "Dados inválidos para multiplicar a célula.");
      } else {
        setError("Erro ao multiplicar célula. Tente novamente.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      // O Modal (Dialog.Root) é controlado só por `open` — não há
      // Dialog.Trigger nem DialogHandle imperativo aqui, então o único jeito
      // do Base UI chamar isto é ao fechar (Esc, backdrop, botão "Fechar"),
      // sempre com `v === false`. `v === true` nunca chega pela UI real.
      onOpenChange={(v) => { reset(); onOpenChange(v); }}
      title="Multiplicar célula"
      description="Crie uma célula filha e escolha quem vai com ela."
      className="max-w-lg"
    >
      {success ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 size={40} className="text-teal" strokeWidth={1.5} />
          <p className="text-sm font-medium text-ink dark:text-white">
            Célula multiplicada com sucesso!
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {/* Nome */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mg-name" className="text-sm font-medium text-ink dark:text-white">
              Nome da célula filha <span className="text-crimson">*</span>
            </Label>
            <Input
              id="mg-name"
              placeholder="ex: Célula Alfa 2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
              className="rounded-[8px]"
            />
          </div>

          {/* Novo líder */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mg-leader" className="text-sm font-medium text-ink dark:text-white">
              Novo líder <span className="text-crimson">*</span>
            </Label>
            <select
              id="mg-leader"
              value={leaderId}
              onChange={(e) => setLeaderId(e.target.value)}
              disabled={isSubmitting}
              className="h-9 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
            >
              <option value="">— Selecione o novo líder —</option>
              {persons.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
            {personsError && (
              <p className="text-xs text-crimson" role="alert">
                Não foi possível carregar as pessoas.{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => { hasFetched.current = false; loadPersons(); }}
                >
                  Tentar de novo
                </button>
              </p>
            )}
          </div>

          {/* Membros a mover */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-ink dark:text-white">
              Membros que vão para a filha{" "}
              <span className="text-xs font-normal text-stone">(opcional)</span>
            </Label>
            {members.length === 0 ? (
              <p className="rounded-[8px] bg-[var(--surface-subtle)] px-3 py-2 text-sm text-stone">
                Nenhum membro nesta célula.
              </p>
            ) : (
              <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-[8px] border border-[var(--border-default)] p-2">
                {members.map((m) => (
                  <label
                    key={m.person.id}
                    className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-sm text-ink hover:bg-[var(--surface-subtle)] dark:text-white"
                  >
                    <input
                      type="checkbox"
                      checked={selectedMemberIds.has(m.person.id)}
                      onChange={() => toggleMember(m.person.id)}
                      disabled={isSubmitting}
                    />
                    {m.person.full_name}
                  </label>
                ))}
              </div>
            )}
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
              {isSubmitting ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                "Multiplicar"
              )}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
