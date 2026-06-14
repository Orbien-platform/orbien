"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, Pencil, Users, CalendarDays, MapPin, Clock } from "lucide-react";
import { Tabs } from "@base-ui/react/tabs";
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
import { RegisterMeetingModal } from "@/components/groups/RegisterMeetingModal";
import { GROUP_TYPES, type GroupType } from "@/components/groups/CreateGroupModal";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Membership {
  id: string;
  role: string;
  person: { id: string; full_name: string };
}

interface Meeting {
  id: string;
  occurred_at: string;
  topic?: string;
  _count?: { attendanceRecords: number };
}

interface GroupDetail {
  id: string;
  name: string;
  type: GroupType;
  meeting_time?: string;
  address?: string;
  public_description?: string;
  leader?: { id: string; full_name: string };
  memberships?: Membership[];
  _count?: { memberships: number };
}

interface GroupDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string | null;
  onUpdated: () => void;
  canEdit: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tabBtn(active: boolean) {
  return cn(
    "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
    active
      ? "border-navy text-navy dark:text-white dark:border-white"
      : "border-transparent text-stone hover:text-ink dark:hover:text-white"
  );
}

function typeLabel(type: GroupType): string {
  return GROUP_TYPES.find((t) => t.value === type)?.label ?? type;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

// ─── Edit form (inline inside sheet) ─────────────────────────────────────────

const DAYS = [
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
  "Domingo",
];

interface EditFormProps {
  group: GroupDetail;
  onSaved: (updated: GroupDetail) => void;
  onCancel: () => void;
}

function EditForm({ group, onSaved, onCancel }: EditFormProps) {
  const [name, setName] = useState(group.name);
  const [meetingDay, setMeetingDay] = useState(() => {
    if (!group.meeting_time) return "";
    const parts = group.meeting_time.split(" ");
    return DAYS.includes(parts[0]) ? parts[0] : "";
  });
  const [meetingTime, setMeetingTime] = useState(() => {
    if (!group.meeting_time) return "";
    const parts = group.meeting_time.split(" ");
    return parts.length > 1 ? parts.slice(1).join(" ") : "";
  });
  const [address, setAddress] = useState(group.address ?? "");
  const [description, setDescription] = useState(group.public_description ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!name.trim()) { setError("Nome é obrigatório."); return; }
    setError("");
    setIsSaving(true);

    let meeting_time: string | undefined;
    if (meetingDay && meetingTime) meeting_time = `${meetingDay} ${meetingTime}`;
    else if (meetingDay || meetingTime) meeting_time = meetingDay || meetingTime;

    try {
      const { data } = await api.patch<GroupDetail>(`/small-groups/${group.id}`, {
        name: name.trim(),
        meeting_time,
        address: address.trim() || undefined,
        public_description: description.trim() || undefined,
      });
      onSaved(data);
    } catch {
      setError("Erro ao salvar alterações.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-4">
      <div className="flex flex-col gap-1.5">
        <Label className="text-sm font-medium text-ink dark:text-white">
          Nome <span className="text-crimson">*</span>
        </Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isSaving}
          className="rounded-[8px]"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm font-medium text-ink dark:text-white">Dia</Label>
          <select
            value={meetingDay}
            onChange={(e) => setMeetingDay(e.target.value)}
            disabled={isSaving}
            className="h-9 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none dark:text-white"
          >
            <option value="">— Dia —</option>
            {DAYS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm font-medium text-ink dark:text-white">Horário</Label>
          <Input
            type="time"
            value={meetingTime}
            onChange={(e) => setMeetingTime(e.target.value)}
            disabled={isSaving}
            className="rounded-[8px]"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-sm font-medium text-ink dark:text-white">Endereço</Label>
        <Input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          disabled={isSaving}
          className="rounded-[8px]"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-sm font-medium text-ink dark:text-white">Descrição</Label>
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isSaving}
          className="w-full rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-2 text-sm text-ink placeholder:text-stone focus:outline-none dark:text-white resize-none"
        />
      </div>

      {error && (
        <p className="rounded-[8px] bg-crimson-dim px-3 py-2 text-sm text-crimson">{error}</p>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1 rounded-[8px]"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="flex-1 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)]"
        >
          {isSaving ? <Loader2 size={15} className="animate-spin" /> : "Salvar"}
        </Button>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function GroupDetailSheet({
  open,
  onOpenChange,
  groupId,
  onUpdated,
  canEdit,
}: GroupDetailSheetProps) {
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("info");
  const [editing, setEditing] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const hasFetched = useRef(false);

  const loadGroup = useCallback(async (id: string) => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    setIsLoading(true);
    try {
      const [groupRes, meetingsRes] = await Promise.allSettled([
        api.get<GroupDetail>(`/small-groups/${id}`),
        api.get<{ data: Meeting[] }>(`/small-groups/${id}/meetings?limit=10`),
      ]);
      if (groupRes.status === "fulfilled") setGroup(groupRes.value.data);
      if (meetingsRes.status === "fulfilled") {
        setMeetings(meetingsRes.value.data.data ?? meetingsRes.value.data as unknown as Meeting[]);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && groupId) {
      hasFetched.current = false;
      setGroup(null);
      setMeetings([]);
      setEditing(false);
      setActiveTab("info");
      loadGroup(groupId);
    }
  }, [open, groupId, loadGroup]);

  function handleSaved(updated: GroupDetail) {
    setGroup(updated);
    setEditing(false);
    onUpdated();
  }

  const members: Membership[] = group?.memberships ?? [];

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-[480px] overflow-y-auto p-0">
          {isLoading || !group ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 size={24} className="animate-spin text-stone" />
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Header */}
              <SheetHeader className="px-4 pt-6 pb-4 border-b border-[var(--border-default)]">
                <div className="flex items-start justify-between gap-3 pr-8">
                  <div className="flex flex-col gap-1">
                    <SheetTitle className="text-base font-medium text-ink dark:text-white leading-tight">
                      {group.name}
                    </SheetTitle>
                    <SheetDescription className="text-xs text-stone">
                      {typeLabel(group.type as GroupType)}
                    </SheetDescription>
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

                {/* Tabs */}
                <div className="mt-3 -mx-4 px-4">
                  <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
                    <Tabs.List className="flex border-b border-[var(--border-default)]">
                      <Tabs.Tab value="info" className={tabBtn(activeTab === "info")}>
                        Informações
                      </Tabs.Tab>
                      <Tabs.Tab value="members" className={tabBtn(activeTab === "members")}>
                        Membros ({members.length})
                      </Tabs.Tab>
                      <Tabs.Tab value="meetings" className={tabBtn(activeTab === "meetings")}>
                        Reuniões
                      </Tabs.Tab>
                    </Tabs.List>
                  </Tabs.Root>
                </div>
              </SheetHeader>

              {/* Body */}
              <div className="flex-1 overflow-y-auto">
                {/* ── Info tab ── */}
                {activeTab === "info" && (
                  editing ? (
                    <div className="pt-4">
                      <EditForm
                        group={group}
                        onSaved={handleSaved}
                        onCancel={() => setEditing(false)}
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-0 divide-y divide-[var(--border-default)]">
                      {/* Leader */}
                      {group.leader && (
                        <InfoRow
                          icon={<Users size={14} strokeWidth={1.5} />}
                          label="Líder"
                          value={group.leader.full_name}
                        />
                      )}
                      {/* Meeting time */}
                      {group.meeting_time && (
                        <InfoRow
                          icon={<Clock size={14} strokeWidth={1.5} />}
                          label="Dia / Horário"
                          value={group.meeting_time}
                        />
                      )}
                      {/* Address */}
                      {group.address && (
                        <InfoRow
                          icon={<MapPin size={14} strokeWidth={1.5} />}
                          label="Endereço"
                          value={group.address}
                        />
                      )}
                      {/* Description */}
                      {group.public_description && (
                        <div className="px-4 py-3">
                          <p className="mb-1 text-xs text-stone">Descrição</p>
                          <p className="text-sm text-ink dark:text-white leading-relaxed">
                            {group.public_description}
                          </p>
                        </div>
                      )}
                      {!group.leader && !group.meeting_time && !group.address && !group.public_description && (
                        <p className="px-4 py-6 text-sm text-stone text-center">
                          Nenhuma informação adicional.
                        </p>
                      )}
                    </div>
                  )
                )}

                {/* ── Members tab ── */}
                {activeTab === "members" && (
                  <div className="flex flex-col">
                    {members.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-stone text-center">
                        Nenhum membro cadastrado.
                      </p>
                    ) : (
                      members.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-default)] last:border-0"
                        >
                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--surface-subtle)] text-xs font-medium text-stone">
                            {initials(m.person.full_name)}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm text-ink dark:text-white">
                              {m.person.full_name}
                            </span>
                            <span className="text-xs text-stone capitalize">{m.role}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* ── Meetings tab ── */}
                {activeTab === "meetings" && (
                  <div className="flex flex-col">
                    {/* Register button */}
                    {canEdit && (
                      <div className="px-4 py-3 border-b border-[var(--border-default)]">
                        <Button
                          type="button"
                          onClick={() => setRegisterOpen(true)}
                          className="w-full rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)] text-sm"
                        >
                          <CalendarDays size={14} className="mr-1.5" strokeWidth={1.5} />
                          Registrar reunião
                        </Button>
                      </div>
                    )}

                    {meetings.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-stone text-center">
                        Nenhuma reunião registrada.
                      </p>
                    ) : (
                      meetings.map((mtg) => (
                        <div
                          key={mtg.id}
                          className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border-default)] last:border-0"
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium text-ink dark:text-white">
                              {formatDate(mtg.occurred_at)}
                            </span>
                            {mtg.topic && (
                              <span className="text-xs text-stone">{mtg.topic}</span>
                            )}
                          </div>
                          {mtg._count !== undefined && (
                            <span className="flex items-center gap-1 text-xs text-stone">
                              <Users size={12} strokeWidth={1.5} />
                              {mtg._count.attendanceRecords} presentes
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {group && (
        <RegisterMeetingModal
          open={registerOpen}
          onOpenChange={setRegisterOpen}
          groupId={group.id}
          groupName={group.name}
          members={members}
          onRegistered={() => {
            // Refresh meetings list
            hasFetched.current = false;
            loadGroup(group.id);
          }}
        />
      )}
    </>
  );
}

// ─── Shared InfoRow ────────────────────────────────────────────────────────────

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="mt-0.5 flex-shrink-0 text-stone">{icon}</div>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-stone">{label}</span>
        <span className="text-sm text-ink dark:text-white">{value}</span>
      </div>
    </div>
  );
}
