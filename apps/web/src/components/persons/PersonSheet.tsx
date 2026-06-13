"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, Phone, Mail, Calendar, User, Edit2, Check, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PersonDetail {
  id: string;
  full_name: string;
  phone?: string;
  email?: string;
  birth_date?: string;
  gender?: string;
  classification: string;
  created_at: string;
  updated_at: string;
}

type Classification = "visitor" | "attendee" | "member";

const CLASSIFICATION_OPTIONS: { value: Classification; label: string }[] = [
  { value: "visitor", label: "Visitante" },
  { value: "attendee", label: "Frequentador" },
  { value: "member", label: "Membro" },
];

interface PersonSheetProps {
  personId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatPhone(phone?: string): string {
  if (!phone) return "—";
  const d = phone.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return phone;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PersonSheet({ personId, open, onOpenChange, onUpdated }: PersonSheetProps) {
  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState<Partial<PersonDetail>>({});
  const [saveError, setSaveError] = useState("");
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!personId || !open) {
      setPerson(null);
      setIsEditing(false);
      hasFetched.current = false;
      return;
    }
    if (hasFetched.current) return;
    hasFetched.current = true;

    setIsLoading(true);
    api.get<PersonDetail>(`/persons/${personId}`)
      .then((r) => setPerson(r.data))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [personId, open]);

  function startEdit() {
    if (!person) return;
    setEditForm({
      full_name: person.full_name,
      phone: person.phone ?? "",
      email: person.email ?? "",
      birth_date: person.birth_date ?? "",
      gender: person.gender ?? "",
      classification: person.classification,
    });
    setSaveError("");
    setIsEditing(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!person) return;
    setSaveError("");
    if (!editForm.full_name?.trim()) { setSaveError("Nome é obrigatório."); return; }

    setIsSaving(true);
    try {
      const { data } = await api.patch<PersonDetail>(`/persons/${person.id}`, {
        full_name: editForm.full_name?.trim(),
        phone: editForm.phone?.trim() || undefined,
        email: editForm.email?.trim() || undefined,
        birth_date: editForm.birth_date || undefined,
        gender: editForm.gender || undefined,
        classification: editForm.classification,
      });
      setPerson(data);
      setIsEditing(false);
      onUpdated();
    } catch {
      setSaveError("Erro ao salvar. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[440px] overflow-y-auto p-0">
        {isLoading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-24" />
            <div className="space-y-3 pt-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          </div>
        ) : !person ? (
          <div className="flex h-full items-center justify-center text-sm text-stone">
            Pessoa não encontrada.
          </div>
        ) : (
          <>
            {/* ── Header ── */}
            <SheetHeader className="border-b border-[var(--border-default)] p-5 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-navy-dim text-sm font-medium text-navy">
                  {person.full_name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <SheetTitle className="text-base font-medium text-ink dark:text-white truncate">
                    {person.full_name}
                  </SheetTitle>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusBadge classification={person.classification} />
                    <span className="text-xs text-stone">
                      desde {formatDate(person.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            </SheetHeader>

            {/* ── Body ── */}
            <div className="p-5">
              {isEditing ? (
                /* ── Edit Form ── */
                <form onSubmit={handleSave} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-stone uppercase tracking-wide">Nome *</Label>
                    <Input
                      value={editForm.full_name ?? ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
                      className="rounded-[8px]"
                      disabled={isSaving}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-stone uppercase tracking-wide">Telefone</Label>
                    <Input
                      type="tel"
                      value={editForm.phone ?? ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                      className="rounded-[8px]"
                      disabled={isSaving}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-stone uppercase tracking-wide">E-mail</Label>
                    <Input
                      type="email"
                      value={editForm.email ?? ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                      className="rounded-[8px]"
                      disabled={isSaving}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-stone uppercase tracking-wide">Nascimento</Label>
                    <Input
                      type="date"
                      value={editForm.birth_date ?? ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, birth_date: e.target.value }))}
                      className="rounded-[8px]"
                      disabled={isSaving}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-stone uppercase tracking-wide">Classificação</Label>
                    <select
                      value={editForm.classification ?? "visitor"}
                      onChange={(e) => setEditForm((f) => ({ ...f, classification: e.target.value }))}
                      disabled={isSaving}
                      className="h-8 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
                    >
                      {CLASSIFICATION_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>

                  {saveError && (
                    <p className="rounded-[8px] bg-crimson-dim px-3 py-2 text-sm text-crimson">{saveError}</p>
                  )}

                  <div className="flex gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 rounded-[8px]"
                      onClick={() => setIsEditing(false)}
                      disabled={isSaving}
                    >
                      <X size={13} />
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={isSaving}
                      className="flex-1 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)]"
                    >
                      {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      Salvar
                    </Button>
                  </div>
                </form>
              ) : (
                /* ── View Mode ── */
                <>
                  <div className="mb-5 flex items-center justify-between">
                    <p className="text-xs font-medium uppercase tracking-wide text-stone">Dados pessoais</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 rounded-[8px] text-xs"
                      onClick={startEdit}
                    >
                      <Edit2 size={12} strokeWidth={1.5} />
                      Editar
                    </Button>
                  </div>

                  <dl className="space-y-3">
                    <InfoRow icon={<Phone size={14} strokeWidth={1.5} />} label="Telefone">
                      {formatPhone(person.phone)}
                    </InfoRow>
                    <InfoRow icon={<Mail size={14} strokeWidth={1.5} />} label="E-mail">
                      {person.email ?? "—"}
                    </InfoRow>
                    <InfoRow icon={<Calendar size={14} strokeWidth={1.5} />} label="Nascimento">
                      {formatDate(person.birth_date)}
                    </InfoRow>
                    <InfoRow icon={<User size={14} strokeWidth={1.5} />} label="Gênero">
                      {person.gender ?? "—"}
                    </InfoRow>
                  </dl>

                  {/* Reclassification */}
                  <div className="mt-6 border-t border-[var(--border-default)] pt-5">
                    <p className="mb-3 text-xs font-medium uppercase tracking-wide text-stone">Reclassificar</p>
                    <div className="flex flex-wrap gap-2">
                      {CLASSIFICATION_OPTIONS.map((o) => (
                        <button
                          key={o.value}
                          onClick={async () => {
                            if (o.value === person.classification) return;
                            try {
                              const { data } = await api.patch<PersonDetail>(
                                `/persons/${person.id}`,
                                { classification: o.value }
                              );
                              setPerson(data);
                              onUpdated();
                            } catch {}
                          }}
                          className={`rounded-[100px] border px-3 py-1 text-xs font-medium transition-colors ${
                            o.value === person.classification
                              ? "border-transparent bg-navy text-white"
                              : "border-[var(--border-default)] text-stone hover:border-navy/40 hover:text-navy"
                          }`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Timestamps */}
                  <div className="mt-6 border-t border-[var(--border-default)] pt-4 text-xs text-stone space-y-1">
                    <p>Cadastrado em {formatDate(person.created_at)}</p>
                    <p>Atualizado em {formatDate(person.updated_at)}</p>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex-shrink-0 text-stone">{icon}</span>
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-stone">{label}</dt>
        <dd className="mt-0.5 text-sm text-ink dark:text-white truncate">{children}</dd>
      </div>
    </div>
  );
}
