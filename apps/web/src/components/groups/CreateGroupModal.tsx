"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GroupTypeSelect } from "@/components/groups/GroupTypeSelect";
import { fetchGroupTypes, type GroupTypeDef } from "@/lib/groupTypes";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Person {
  id: string;
  full_name: string;
}

interface CreateGroupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const DAYS = [
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
  "Domingo",
];

// ─── Component ────────────────────────────────────────────────────────────────

export function CreateGroupModal({
  open,
  onOpenChange,
  onCreated,
}: CreateGroupModalProps) {
  const [name, setName] = useState("");
  const [groupTypeId, setGroupTypeId] = useState("");
  const [leaderId, setLeaderId] = useState("");
  const [address, setAddress] = useState("");
  const [meetingDay, setMeetingDay] = useState("");
  const [meetingTime, setMeetingTime] = useState("");
  const [description, setDescription] = useState("");
  const [persons, setPersons] = useState<Person[]>([]);
  const [groupTypes, setGroupTypes] = useState<GroupTypeDef[]>([]);
  const [isLoadingTypes, setIsLoadingTypes] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const hasFetched = useRef(false);

  const loadData = useCallback(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    api
      .get<{ data: Person[]; total: number }>("/persons?limit=100")
      .then((r) => setPersons(r.data.data ?? []))
      .catch(() => {});
    setIsLoadingTypes(true);
    fetchGroupTypes()
      .then(setGroupTypes)
      .catch(() => setGroupTypes([]))
      .finally(() => setIsLoadingTypes(false));
  }, []);

  useEffect(() => {
    if (open) loadData();
  }, [open, loadData]);

  function buildMeetingTime(): string | undefined {
    if (!meetingDay && !meetingTime) return undefined;
    if (meetingDay && meetingTime) return `${meetingDay} ${meetingTime}`;
    return meetingDay || meetingTime || undefined;
  }

  function reset() {
    setName("");
    setGroupTypeId("");
    setLeaderId("");
    setAddress("");
    setMeetingDay("");
    setMeetingTime("");
    setDescription("");
    setError("");
    setSuccess(false);
    hasFetched.current = false;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("Nome é obrigatório."); return; }
    if (!groupTypeId) { setError("Selecione o tipo do grupo."); return; }
    if (!leaderId) { setError("Selecione um líder."); return; }

    setIsSubmitting(true);
    try {
      await api.post("/small-groups", {
        name: name.trim(),
        group_type_id: groupTypeId,
        leader_person_id: leaderId,
        address: address.trim() || undefined,
        meeting_time: buildMeetingTime(),
        public_description: description.trim() || undefined,
      });
      setSuccess(true);
      setTimeout(() => {
        onCreated();
        onOpenChange(false);
        reset();
      }, 1200);
    } catch {
      setError("Erro ao criar grupo. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}
      title="Novo grupo"
      description="Configure o grupo antes de adicionar membros."
      className="max-w-lg"
    >
      {success ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 size={40} className="text-teal" strokeWidth={1.5} />
          <p className="text-sm font-medium text-ink dark:text-white">
            Grupo criado com sucesso!
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {/* Nome */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cg-name" className="text-sm font-medium text-ink dark:text-white">
              Nome do grupo <span className="text-crimson">*</span>
            </Label>
            <Input
              id="cg-name"
              placeholder="ex: Célula Alfa"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
              className="rounded-[8px]"
            />
          </div>

          {/* Tipo */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cg-type" className="text-sm font-medium text-ink dark:text-white">
              Tipo <span className="text-crimson">*</span>
            </Label>
            {!isLoadingTypes && groupTypes.length === 0 ? (
              <p className="rounded-[8px] bg-[var(--surface-subtle)] px-3 py-2 text-sm text-stone">
                Nenhum tipo cadastrado. Configure os tipos em Grupos → Tipos.
              </p>
            ) : (
              <GroupTypeSelect
                id="cg-type"
                types={groupTypes}
                value={groupTypeId}
                onValueChange={setGroupTypeId}
                disabled={isSubmitting || isLoadingTypes}
              />
            )}
          </div>

          {/* Líder */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cg-leader" className="text-sm font-medium text-ink dark:text-white">
              Líder <span className="text-crimson">*</span>
            </Label>
            <select
              id="cg-leader"
              value={leaderId}
              onChange={(e) => setLeaderId(e.target.value)}
              disabled={isSubmitting}
              className="h-9 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
            >
              <option value="">— Selecione o líder —</option>
              {persons.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </div>

          {/* Dia / Horário */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-ink dark:text-white">Dia</Label>
              <select
                value={meetingDay}
                onChange={(e) => setMeetingDay(e.target.value)}
                disabled={isSubmitting}
                className="h-9 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
              >
                <option value="">— Dia —</option>
                {DAYS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cg-time" className="text-sm font-medium text-ink dark:text-white">Horário</Label>
              <Input
                id="cg-time"
                type="time"
                value={meetingTime}
                onChange={(e) => setMeetingTime(e.target.value)}
                disabled={isSubmitting}
                className="rounded-[8px]"
              />
            </div>
          </div>

          {/* Endereço */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cg-address" className="text-sm font-medium text-ink dark:text-white">
              Endereço <span className="text-xs font-normal text-stone">(opcional)</span>
            </Label>
            <Input
              id="cg-address"
              placeholder="Rua, número, bairro"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={isSubmitting}
              className="rounded-[8px]"
            />
          </div>

          {/* Descrição */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cg-desc" className="text-sm font-medium text-ink dark:text-white">
              Descrição <span className="text-xs font-normal text-stone">(opcional)</span>
            </Label>
            <textarea
              id="cg-desc"
              rows={2}
              placeholder="Breve descrição do grupo…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-2 text-sm text-ink placeholder:text-stone focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white resize-none"
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
              {isSubmitting ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                "Criar grupo"
              )}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
