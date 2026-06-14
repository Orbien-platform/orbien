"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, Pencil, UserPlus, Users } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/Modal";
import { MINISTRY_COLORS } from "@/components/volunteers/CreateMinistryModal";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VolunteerProfile {
  id: string;
  person: { id: string; full_name: string };
  skills?: string[];
  availability?: string;
}

interface Person {
  id: string;
  full_name: string;
}

interface Ministry {
  id: string;
  name: string;
  description?: string;
  color?: string;
}

interface MinistryDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ministryId: string | null;
  canEdit: boolean;
  onUpdated: () => void;
}

// ─── Add Volunteer Modal ───────────────────────────────────────────────────────

interface AddVolunteerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ministryId: string;
  existingPersonIds: string[];
  onAdded: () => void;
}

function AddVolunteerModal({
  open,
  onOpenChange,
  ministryId,
  existingPersonIds,
  onAdded,
}: AddVolunteerModalProps) {
  const [persons, setPersons] = useState<Person[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!open || hasFetched.current) return;
    hasFetched.current = true;
    api
      .get<{ data: Person[] }>("/persons?limit=100")
      .then((r) => {
        const all = r.data.data ?? [];
        setPersons(all.filter((p) => !existingPersonIds.includes(p.id)));
      })
      .catch(() => {});
  }, [open, existingPersonIds]);

  async function handleAdd() {
    if (!selectedId) { setError("Selecione uma pessoa."); return; }
    setError("");
    setIsSubmitting(true);
    try {
      await api.post("/volunteers/profiles", {
        ministry_id: ministryId,
        person_id: selectedId,
      });
      onAdded();
      onOpenChange(false);
      setSelectedId("");
      hasFetched.current = false;
    } catch {
      setError("Erro ao adicionar voluntário.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(v) => { if (!v) { setSelectedId(""); setError(""); hasFetched.current = false; } onOpenChange(v); }}
      title="Adicionar voluntário"
      className="max-w-sm"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm font-medium text-ink dark:text-white">Pessoa</Label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={isSubmitting}
            className="h-9 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none dark:text-white"
          >
            <option value="">— Selecione —</option>
            {persons.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
        </div>
        {error && (
          <p className="rounded-[8px] bg-crimson-dim px-3 py-2 text-sm text-crimson">{error}</p>
        )}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 rounded-[8px]" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleAdd} disabled={isSubmitting} className="flex-1 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)]">
            {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : "Adicionar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function MinistryDetailSheet({
  open,
  onOpenChange,
  ministryId,
  canEdit,
  onUpdated,
}: MinistryDetailSheetProps) {
  const [ministry, setMinistry] = useState<Ministry | null>(null);
  const [profiles, setProfiles] = useState<VolunteerProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editColor, setEditColor] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const hasFetched = useRef(false);

  const loadData = useCallback(async (id: string) => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    setIsLoading(true);
    try {
      const [mRes, pRes] = await Promise.allSettled([
        api.get<Ministry>(`/volunteers/ministries/${id}`),
        api.get<{ data: VolunteerProfile[] } | VolunteerProfile[]>(
          `/volunteers/profiles?ministry_id=${id}&limit=100`
        ),
      ]);
      if (mRes.status === "fulfilled") {
        const m = mRes.value.data;
        setMinistry(m);
        setEditName(m.name);
        setEditDesc(m.description ?? "");
        setEditColor(m.color ?? MINISTRY_COLORS[0].value);
      }
      if (pRes.status === "fulfilled") {
        const d = pRes.value.data;
        setProfiles(Array.isArray(d) ? d : d.data ?? []);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && ministryId) {
      hasFetched.current = false;
      setMinistry(null);
      setProfiles([]);
      setEditing(false);
      loadData(ministryId);
    }
  }, [open, ministryId, loadData]);

  async function handleSave() {
    if (!editName.trim() || !ministryId) return;
    setSaveError("");
    setIsSaving(true);
    try {
      const { data } = await api.patch<Ministry>(`/volunteers/ministries/${ministryId}`, {
        name: editName.trim(),
        description: editDesc.trim() || undefined,
        color: editColor,
      });
      setMinistry(data);
      setEditing(false);
      onUpdated();
    } catch {
      setSaveError("Erro ao salvar.");
    } finally {
      setIsSaving(false);
    }
  }

  const existingPersonIds = profiles.map((p) => p.person.id);

  function initials(name: string) {
    return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
  }

  const dotColor = ministry?.color ?? "#1E3A5F";

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-[440px] overflow-y-auto p-0">
          {isLoading || !ministry ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 size={24} className="animate-spin text-stone" />
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Header */}
              <SheetHeader className="px-4 pt-6 pb-4 border-b border-[var(--border-default)]">
                <div className="flex items-start gap-3 pr-8">
                  <div
                    className="mt-1 h-10 w-1.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: dotColor }}
                  />
                  <div className="flex flex-col gap-0.5 flex-1">
                    <SheetTitle className="text-base font-medium text-ink dark:text-white">
                      {ministry.name}
                    </SheetTitle>
                    {ministry.description && (
                      <SheetDescription className="text-xs text-stone">
                        {ministry.description}
                      </SheetDescription>
                    )}
                  </div>
                  {canEdit && !editing && (
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      className="flex items-center gap-1 rounded-[6px] px-2 py-1 text-xs text-stone hover:bg-[var(--surface-subtle)] hover:text-ink transition-colors"
                    >
                      <Pencil size={12} strokeWidth={1.5} />
                      Editar
                    </button>
                  )}
                </div>
              </SheetHeader>

              {/* Body */}
              <div className="flex-1 overflow-y-auto">
                {/* ── Edit form ── */}
                {editing && (
                  <div className="flex flex-col gap-4 p-4 border-b border-[var(--border-default)]">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-sm font-medium text-ink dark:text-white">Nome *</Label>
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} disabled={isSaving} className="rounded-[8px]" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-sm font-medium text-ink dark:text-white">Descrição</Label>
                      <textarea
                        rows={2}
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        disabled={isSaving}
                        className="w-full rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-2 text-sm text-ink focus:outline-none dark:text-white resize-none"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label className="text-sm font-medium text-ink dark:text-white">Cor</Label>
                      <div className="flex flex-wrap gap-2">
                        {MINISTRY_COLORS.map((c) => (
                          <button
                            key={c.value}
                            type="button"
                            onClick={() => setEditColor(c.value)}
                            disabled={isSaving}
                            className={cn(
                              "h-7 w-7 rounded-full border-2 transition-transform hover:scale-110",
                              editColor === c.value ? "border-ink dark:border-white scale-110" : "border-transparent"
                            )}
                            style={{ backgroundColor: c.value }}
                          />
                        ))}
                      </div>
                    </div>
                    {saveError && <p className="text-sm text-crimson">{saveError}</p>}
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1 rounded-[8px]" onClick={() => setEditing(false)} disabled={isSaving}>Cancelar</Button>
                      <Button onClick={handleSave} disabled={isSaving} className="flex-1 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)]">
                        {isSaving ? <Loader2 size={15} className="animate-spin" /> : "Salvar"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* ── Volunteers section ── */}
                <div className="flex flex-col">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-default)]">
                    <div className="flex items-center gap-2 text-sm font-medium text-ink dark:text-white">
                      <Users size={14} strokeWidth={1.5} />
                      Voluntários ({profiles.length})
                    </div>
                    {canEdit && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setAddOpen(true)}
                        className="flex items-center gap-1 rounded-[6px] px-2 py-1 text-xs"
                      >
                        <UserPlus size={12} strokeWidth={1.5} />
                        Adicionar
                      </Button>
                    )}
                  </div>

                  {profiles.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-stone text-center">
                      Nenhum voluntário vinculado.
                    </p>
                  ) : (
                    profiles.map((vp) => (
                      <div
                        key={vp.id}
                        className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-default)] last:border-0"
                      >
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--surface-subtle)] text-xs font-medium text-stone">
                          {initials(vp.person.full_name)}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm text-ink dark:text-white">
                            {vp.person.full_name}
                          </span>
                          {(vp.skills?.length ?? 0) > 0 && (
                            <span className="text-xs text-stone">
                              {vp.skills!.join(", ")}
                            </span>
                          )}
                          {vp.availability && (
                            <span className="text-xs text-stone">{vp.availability}</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {ministryId && (
        <AddVolunteerModal
          open={addOpen}
          onOpenChange={setAddOpen}
          ministryId={ministryId}
          existingPersonIds={existingPersonIds}
          onAdded={() => {
            hasFetched.current = false;
            loadData(ministryId);
          }}
        />
      )}
    </>
  );
}
