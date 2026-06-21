"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  Loader2,
  Pencil,
  UserPlus,
  Users,
  Crown,
  Trash2,
  X,
  FolderTree,
  AlertTriangle,
} from "lucide-react";
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
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MINISTRY_COLORS } from "@/components/volunteers/CreateMinistryModal";
import { findMinistryNode, type MinistryTreeNode } from "@/lib/ministryTree";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type MinistryRole = "leader" | "volunteer";

interface Person {
  id: string;
  full_name: string;
  classification: string;
}

interface VolunteerProfileBrief {
  id: string;
  person: Person;
}

interface MinistryAssignment {
  id: string;
  role: MinistryRole;
  is_primary_leader: boolean;
  volunteerProfile: VolunteerProfileBrief;
}

interface MinistryDetail {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  parent_ministry_id?: string | null;
  leaders: MinistryAssignment[];
  volunteers: MinistryAssignment[];
}

interface MinistryDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ministryId: string | null;
  canEdit: boolean;
  tree: MinistryTreeNode[];
  onUpdated: () => void;
  onSelectMinistry: (id: string) => void;
}

function apiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.message === "string") {
    return err.response.data.message;
  }
  return fallback;
}

// ─── Add Member Modal ──────────────────────────────────────────────────────────

interface AddMinistryMemberModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ministryId: string;
  existingPersonIds: string[];
  onAdded: () => void;
}

function AddMinistryMemberModal({
  open,
  onOpenChange,
  ministryId,
  existingPersonIds,
  onAdded,
}: AddMinistryMemberModalProps) {
  const [role, setRole] = useState<MinistryRole>("volunteer");
  const [isPrimary, setIsPrimary] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [toastMsg, setToastMsg] = useState("");

  const hasFetchedProfiles = useRef(false);

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 4000);
  }

  function reset() {
    setRole("volunteer");
    setIsPrimary(false);
    setQuery("");
    setResults([]);
    setSelectedPerson(null);
    setError("");
    hasFetchedProfiles.current = false;
  }

  // Load existing volunteer profiles once per open, to avoid creating
  // duplicate profiles for people who already have one.
  useEffect(() => {
    if (!open || hasFetchedProfiles.current) return;
    hasFetchedProfiles.current = true;
    api
      .get<{ id: string; person_id: string }[] | { data: { id: string; person_id: string }[] }>(
        "/volunteers/profiles"
      )
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data : r.data.data ?? [];
        const map: Record<string, string> = {};
        for (const p of list) map[p.person_id] = p.id;
        setProfileMap(map);
      })
      .catch(() => {});
  }, [open]);

  // Debounced search-by-name, filtered by classification rules for the
  // selected role (client-side mirror of the API's own validation).
  useEffect(() => {
    if (!open || !query.trim()) { setResults([]); return; }
    const handle = setTimeout(() => {
      setIsSearching(true);
      const params = new URLSearchParams({ search: query.trim(), limit: "10" });
      if (role === "leader") params.set("classification", "member");
      api
        .get<{ data: Person[] }>(`/persons?${params}`)
        .then((r) => {
          let list = r.data.data ?? [];
          if (role === "volunteer") list = list.filter((p) => p.classification !== "visitor");
          list = list.filter((p) => !existingPersonIds.includes(p.id));
          setResults(list);
        })
        .catch(() => setResults([]))
        .finally(() => setIsSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query, role, open, existingPersonIds]);

  function handleRoleChange(next: MinistryRole) {
    setRole(next);
    setIsPrimary(false);
    setSelectedPerson(null);
    setQuery("");
    setResults([]);
  }

  async function handleSubmit() {
    if (!selectedPerson) { setError("Selecione uma pessoa."); return; }
    setError("");
    setIsSubmitting(true);
    try {
      let profileId = profileMap[selectedPerson.id];
      if (!profileId) {
        const { data } = await api.post<{ id: string }>("/volunteers/profiles", {
          person_id: selectedPerson.id,
          availability: {},
        });
        profileId = data.id;
        setProfileMap((prev) => ({ ...prev, [selectedPerson.id]: profileId }));
      }
      await api.post("/volunteers/ministry-assignments", {
        volunteer_profile_id: profileId,
        ministry_id: ministryId,
        role,
        ...(role === "leader" ? { is_primary_leader: isPrimary } : {}),
      });
      onAdded();
      onOpenChange(false);
      reset();
    } catch (err) {
      showToast(apiErrorMessage(err, "Erro ao adicionar pessoa."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}
        title="Adicionar pessoa"
        className="max-w-sm"
      >
        <div className="flex flex-col gap-4">
          {/* Função */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-ink dark:text-white">Função</Label>
            <select
              value={role}
              onChange={(e) => handleRoleChange(e.target.value as MinistryRole)}
              disabled={isSubmitting}
              className="h-9 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none dark:text-white"
            >
              <option value="volunteer">Voluntário</option>
              <option value="leader">Líder</option>
            </select>
            <p className="text-xs text-stone">
              {role === "leader"
                ? "Apenas membros podem ser líderes — mostrando só membros."
                : "Visitantes não podem ser voluntários — mostrando frequentadores e membros."}
            </p>
          </div>

          {/* Pessoa */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-ink dark:text-white">Pessoa</Label>
            <div className="relative">
              <Input
                placeholder="Buscar pelo nome…"
                value={selectedPerson ? selectedPerson.full_name : query}
                onChange={(e) => { setQuery(e.target.value); setSelectedPerson(null); }}
                disabled={isSubmitting}
                className="rounded-[8px] pr-8"
              />
              {selectedPerson && (
                <button
                  type="button"
                  onClick={() => { setSelectedPerson(null); setQuery(""); }}
                  aria-label="Limpar seleção"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-stone hover:text-ink"
                >
                  <X size={14} strokeWidth={1.5} />
                </button>
              )}
              {!selectedPerson && query.trim() && (
                <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] shadow-[var(--shadow-lg)]">
                  {isSearching ? (
                    <div className="flex items-center justify-center py-3">
                      <Loader2 size={14} className="animate-spin text-stone" />
                    </div>
                  ) : results.length === 0 ? (
                    <p className="px-3 py-2.5 text-sm text-stone">Nenhuma pessoa encontrada.</p>
                  ) : (
                    results.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setSelectedPerson(p); setQuery(""); setResults([]); }}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--surface-subtle)]"
                      >
                        <span className="text-ink dark:text-white">{p.full_name}</span>
                        <StatusBadge classification={p.classification} />
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Líder principal */}
          {role === "leader" && (
            <label className="flex items-center gap-2 text-sm text-ink dark:text-white">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
                disabled={isSubmitting}
                className="rounded"
              />
              Marcar como líder principal
            </label>
          )}

          {error && (
            <p className="rounded-[8px] bg-crimson-dim px-3 py-2 text-sm text-crimson">{error}</p>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-[8px]" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)]">
              {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : "Adicionar"}
            </Button>
          </div>
        </div>
      </Modal>

      {toastMsg && (
        <div className="fixed bottom-4 right-4 z-[80] rounded-[8px] bg-ink px-4 py-2.5 text-sm text-white shadow-lg dark:bg-white dark:text-ink">
          {toastMsg}
        </div>
      )}
    </>
  );
}

// ─── Member row ─────────────────────────────────────────────────────────────────

function PrimaryBadge() {
  return (
    <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
      <Crown size={10} strokeWidth={1.5} />
      Principal
    </span>
  );
}

function MemberRow({
  name,
  isPrimary,
  showMakePrimary,
  canEdit,
  isBusy,
  onMakePrimary,
  onRemove,
}: {
  name: string;
  isPrimary?: boolean;
  showMakePrimary?: boolean;
  canEdit: boolean;
  isBusy: boolean;
  onMakePrimary?: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border-default)] px-4 py-3 last:border-0">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm text-ink dark:text-white">{name}</span>
        {isPrimary && <PrimaryBadge />}
      </div>
      {canEdit && (
        <div className="flex flex-shrink-0 items-center gap-1">
          {showMakePrimary && (
            <button
              type="button"
              onClick={onMakePrimary}
              disabled={isBusy}
              className="rounded-[6px] px-2 py-1 text-xs text-stone transition-colors hover:bg-[var(--surface-subtle)] hover:text-ink"
            >
              Tornar principal
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            disabled={isBusy}
            aria-label="Remover"
            className="rounded-[6px] p-1.5 text-stone transition-colors hover:bg-crimson-dim hover:text-crimson"
          >
            <Trash2 size={13} strokeWidth={1.5} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function MinistryDetailSheet({
  open,
  onOpenChange,
  ministryId,
  canEdit,
  tree,
  onUpdated,
  onSelectMinistry,
}: MinistryDetailSheetProps) {
  const [ministry, setMinistry] = useState<MinistryDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editColor, setEditColor] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Remove confirmation
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [primaryBusyId, setPrimaryBusyId] = useState<string | null>(null);

  const hasFetched = useRef(false);

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 4000);
  }

  const loadData = useCallback(async (id: string) => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    setIsLoading(true);
    try {
      const { data } = await api.get<MinistryDetail>(`/volunteers/ministries/${id}`);
      setMinistry(data);
      setEditName(data.name);
      setEditDesc(data.description ?? "");
      setEditColor(data.color ?? MINISTRY_COLORS[0].value);
    } catch {
      setMinistry(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && ministryId) {
      hasFetched.current = false;
      setMinistry(null);
      setEditing(false);
      loadData(ministryId);
    }
  }, [open, ministryId, loadData]);

  async function handleSave() {
    if (!editName.trim() || !ministryId) return;
    setSaveError("");
    setIsSaving(true);
    try {
      const { data } = await api.patch<MinistryDetail>(`/volunteers/ministries/${ministryId}`, {
        name: editName.trim(),
        description: editDesc.trim() || undefined,
        color: editColor,
      });
      setMinistry((prev) => (prev ? { ...prev, ...data } : prev));
      setEditing(false);
      onUpdated();
    } catch (err) {
      setSaveError(apiErrorMessage(err, "Erro ao salvar."));
    } finally {
      setIsSaving(false);
    }
  }

  async function makePrimary(assignmentId: string) {
    if (!ministryId) return;
    setPrimaryBusyId(assignmentId);
    try {
      await api.patch(`/volunteers/ministry-assignments/${assignmentId}`, { is_primary_leader: true });
      hasFetched.current = false;
      await loadData(ministryId);
      onUpdated();
      showToast("Líder principal atualizado.");
    } catch (err) {
      showToast(apiErrorMessage(err, "Erro ao atualizar líder principal."));
    } finally {
      setPrimaryBusyId(null);
    }
  }

  async function handleRemove() {
    if (!removeTarget || !ministryId) return;
    setIsRemoving(true);
    try {
      await api.delete(`/volunteers/ministry-assignments/${removeTarget.id}`);
      setRemoveTarget(null);
      hasFetched.current = false;
      await loadData(ministryId);
      onUpdated();
      showToast("Pessoa removida do ministério.");
    } catch (err) {
      showToast(apiErrorMessage(err, "Erro ao remover pessoa."));
    } finally {
      setIsRemoving(false);
    }
  }

  const children = ministryId ? findMinistryNode(tree, ministryId)?.children ?? [] : [];
  const existingPersonIds = ministry
    ? [...ministry.leaders, ...ministry.volunteers].map((m) => m.volunteerProfile.person.id)
    : [];

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

                {/* ── Add person button ── */}
                {canEdit && (
                  <div className="flex items-center justify-end px-4 py-3 border-b border-[var(--border-default)]">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setAddOpen(true)}
                      className="flex items-center gap-1 rounded-[6px] px-2 py-1 text-xs"
                    >
                      <UserPlus size={12} strokeWidth={1.5} />
                      Adicionar pessoa
                    </Button>
                  </div>
                )}

                {/* ── Leaders section ── */}
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-default)] text-sm font-medium text-ink dark:text-white">
                    <Crown size={14} strokeWidth={1.5} />
                    Líderes ({ministry.leaders.length})
                  </div>
                  {ministry.leaders.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-stone text-center">
                      Nenhum líder vinculado.
                    </p>
                  ) : (
                    ministry.leaders.map((l) => (
                      <MemberRow
                        key={l.id}
                        name={l.volunteerProfile.person.full_name}
                        isPrimary={l.is_primary_leader}
                        showMakePrimary={!l.is_primary_leader}
                        canEdit={canEdit}
                        isBusy={primaryBusyId === l.id || (removeTarget?.id === l.id && isRemoving)}
                        onMakePrimary={() => makePrimary(l.id)}
                        onRemove={() => setRemoveTarget({ id: l.id, name: l.volunteerProfile.person.full_name })}
                      />
                    ))
                  )}
                </div>

                {/* ── Volunteers section ── */}
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-default)] text-sm font-medium text-ink dark:text-white">
                    <Users size={14} strokeWidth={1.5} />
                    Voluntários ({ministry.volunteers.length})
                  </div>
                  {ministry.volunteers.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-stone text-center">
                      Nenhum voluntário vinculado.
                    </p>
                  ) : (
                    ministry.volunteers.map((v) => (
                      <MemberRow
                        key={v.id}
                        name={v.volunteerProfile.person.full_name}
                        canEdit={canEdit}
                        isBusy={removeTarget?.id === v.id && isRemoving}
                        onRemove={() => setRemoveTarget({ id: v.id, name: v.volunteerProfile.person.full_name })}
                      />
                    ))
                  )}
                </div>

                {/* ── Sub-ministries section ── */}
                {children.length > 0 && (
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-default)] text-sm font-medium text-ink dark:text-white">
                      <FolderTree size={14} strokeWidth={1.5} />
                      Sub-ministérios ({children.length})
                    </div>
                    {children.map((child) => (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => onSelectMinistry(child.id)}
                        className="flex items-center gap-2.5 border-b border-[var(--border-default)] px-4 py-3 text-left last:border-0 hover:bg-[var(--surface-subtle)]"
                      >
                        <div
                          className="h-2 w-2 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: child.color ?? "#1E3A5F" }}
                        />
                        <span className="text-sm text-ink dark:text-white">{child.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {ministryId && (
        <AddMinistryMemberModal
          open={addOpen}
          onOpenChange={setAddOpen}
          ministryId={ministryId}
          existingPersonIds={existingPersonIds}
          onAdded={() => {
            hasFetched.current = false;
            loadData(ministryId);
            onUpdated();
          }}
        />
      )}

      {/* Remove confirmation */}
      {removeTarget && (
        <Modal
          open={!!removeTarget}
          onOpenChange={(v) => { if (!v) setRemoveTarget(null); }}
          title="Remover do ministério?"
          className="max-w-sm"
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-[8px] bg-[var(--surface-subtle)] px-3 py-3">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-stone" strokeWidth={1.5} />
              <p className="text-sm text-ink dark:text-white">
                {removeTarget.name} será removido(a) deste ministério. Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-[8px]" onClick={() => setRemoveTarget(null)} disabled={isRemoving}>
                Cancelar
              </Button>
              <Button onClick={handleRemove} disabled={isRemoving} className="flex-1 rounded-[8px] bg-crimson text-white hover:opacity-90">
                {isRemoving ? <Loader2 size={15} className="animate-spin" /> : "Remover"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {toastMsg && (
        <div className="fixed bottom-4 right-4 z-[80] rounded-[8px] bg-ink px-4 py-2.5 text-sm text-white shadow-lg dark:bg-white dark:text-ink">
          {toastMsg}
        </div>
      )}
    </>
  );
}
