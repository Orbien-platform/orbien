"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

interface NamedItem { id: string; name: string; }

const ROLES = [
  { value: "member", label: "Membro" },
  { value: "attendee", label: "Frequentador" },
  { value: "visitor", label: "Visitante" },
  { value: "leader", label: "Líder" },
  { value: "pastor", label: "Pastor" },
  { value: "ministry_leader", label: "Líder de Ministério" },
];

function CheckboxList({
  items,
  selected,
  disabled,
  onToggle,
}: {
  items: NamedItem[];
  selected: string[];
  disabled?: boolean;
  onToggle: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="max-h-[100px] overflow-y-auto rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] p-2 space-y-1">
      {items.map((item) => (
        <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-[var(--surface-subtle)]">
          <input
            type="checkbox"
            checked={selected.includes(item.id)}
            onChange={() => onToggle(item.id)}
            disabled={disabled}
            className="rounded"
          />
          <span className="text-sm text-ink dark:text-white">{item.name}</span>
        </label>
      ))}
    </div>
  );
}

interface CreateSegmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateSegmentModal({
  open,
  onOpenChange,
  onCreated,
}: CreateSegmentModalProps) {
  const [name, setName] = useState("");
  const [groups, setGroups] = useState<NamedItem[]>([]);
  const [ministries, setMinistries] = useState<NamedItem[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedMinistryIds, setSelectedMinistryIds] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!open || hasFetched.current) return;
    hasFetched.current = true;
    Promise.allSettled([
      api.get<{ data: NamedItem[] } | NamedItem[]>("/small-groups?limit=100"),
      api.get<{ data: NamedItem[] } | NamedItem[]>("/volunteers/ministries?limit=100"),
    ]).then(([gRes, mRes]) => {
      if (gRes.status === "fulfilled") {
        const d = gRes.value.data;
        setGroups(Array.isArray(d) ? d : d.data ?? []);
      }
      if (mRes.status === "fulfilled") {
        const d = mRes.value.data;
        setMinistries(Array.isArray(d) ? d : d.data ?? []);
      }
    });
  }, [open]);

  function toggleId(list: string[], id: string, set: (v: string[]) => void) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  function reset() {
    setName(""); setSelectedGroupIds([]); setSelectedMinistryIds([]);
    setSelectedRoles([]); setMinAge(""); setMaxAge("");
    setError(""); setSuccess(false); hasFetched.current = false;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Nome é obrigatório."); return; }
    setError("");
    setIsSubmitting(true);

    const criteria: Record<string, unknown> = {};
    if (selectedGroupIds.length > 0) criteria.group_ids = selectedGroupIds;
    if (selectedMinistryIds.length > 0) criteria.ministry_ids = selectedMinistryIds;
    if (selectedRoles.length > 0) criteria.roles = selectedRoles;
    if (minAge) criteria.min_age = parseInt(minAge, 10);
    if (maxAge) criteria.max_age = parseInt(maxAge, 10);

    try {
      await api.post("/content/segments", { name: name.trim(), criteria });
      setSuccess(true);
      setTimeout(() => { onCreated(); onOpenChange(false); reset(); }, 1200);
    } catch {
      setError("Erro ao criar segmento. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}
      title="Novo segmento"
      description="Defina os critérios para segmentar destinatários."
      className="max-w-lg"
    >
      {success ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 size={40} className="text-teal" strokeWidth={1.5} />
          <p className="text-sm font-medium text-ink dark:text-white">Segmento criado!</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="seg-name" className="text-sm font-medium text-ink dark:text-white">
              Nome <span className="text-crimson">*</span>
            </Label>
            <Input
              id="seg-name"
              placeholder="ex: Jovens adultos"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
              className="rounded-[8px]"
            />
          </div>

          {groups.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-ink dark:text-white">Grupos</Label>
              <CheckboxList
                items={groups}
                selected={selectedGroupIds}
                disabled={isSubmitting}
                onToggle={(id) => toggleId(selectedGroupIds, id, setSelectedGroupIds)}
              />
            </div>
          )}

          {ministries.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-ink dark:text-white">Ministérios</Label>
              <CheckboxList
                items={ministries}
                selected={selectedMinistryIds}
                disabled={isSubmitting}
                onToggle={(id) => toggleId(selectedMinistryIds, id, setSelectedMinistryIds)}
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-ink dark:text-white">Perfis</Label>
            <div className="flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <label key={r.value} className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={selectedRoles.includes(r.value)}
                    onChange={() => toggleId(selectedRoles, r.value, setSelectedRoles)}
                    disabled={isSubmitting}
                    className="rounded"
                  />
                  <span className="text-sm text-ink dark:text-white">{r.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor="seg-minage" className="text-sm font-medium text-ink dark:text-white">
                Idade mínima
              </Label>
              <Input
                id="seg-minage"
                type="number"
                min={0}
                max={120}
                placeholder="ex: 18"
                value={minAge}
                onChange={(e) => setMinAge(e.target.value)}
                disabled={isSubmitting}
                className="rounded-[8px]"
              />
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor="seg-maxage" className="text-sm font-medium text-ink dark:text-white">
                Idade máxima
              </Label>
              <Input
                id="seg-maxage"
                type="number"
                min={0}
                max={120}
                placeholder="ex: 35"
                value={maxAge}
                onChange={(e) => setMaxAge(e.target.value)}
                disabled={isSubmitting}
                className="rounded-[8px]"
              />
            </div>
          </div>

          {error && (
            <p className="rounded-[8px] bg-crimson-dim px-3 py-2 text-sm text-crimson" role="alert">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1 rounded-[8px]" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)]">
              {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : "Criar segmento"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
