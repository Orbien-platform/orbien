"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import {
  AlertTriangle,
  LayoutTemplate,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/skeleton";
import { flattenMinistryTree, type MinistryTreeNode } from "@/lib/ministryTree";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TemplateMinistry {
  id: string;
  ministry_id: string;
  slots: number;
  ministry: { id: string; name: string };
}

export interface ScheduleTemplate {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  ministries: TemplateMinistry[];
}

/** Linha do formulário: ministério + vagas. */
interface FormRow {
  ministry_id: string;
  slots: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function errMsg(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.message === "string") {
    return err.response.data.message;
  }
  return fallback;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TemplatesPanel({ canEdit }: { canEdit: boolean }) {
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ministryTree, setMinistryTree] = useState<MinistryTreeNode[]>([]);
  const [ministriesLoaded, setMinistriesLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Formulário (criar ou editar)
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleTemplate | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rows, setRows] = useState<FormRow[]>([{ ministry_id: "", slots: "1" }]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    const signal = { cancelled: false };
    api
      .get<ScheduleTemplate[]>("/celebrations/schedule-templates")
      .then(({ data }) => {
        if (signal.cancelled) return;
        setTemplates(Array.isArray(data) ? data : []);
        setError(null);
      })
      .catch((err: unknown) => {
        if (signal.cancelled) return;
        setError(errMsg(err, "Não foi possível carregar os templates."));
      })
      .finally(() => {
        if (!signal.cancelled) setLoaded(true);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    api
      .get<MinistryTreeNode[]>("/volunteers/ministries")
      .then(({ data }) => setMinistryTree(Array.isArray(data) ? data : []))
      .catch(() => setMinistryTree([]))
      .finally(() => setMinistriesLoaded(true));
  }, []);

  const ministryOptions = flattenMinistryTree(ministryTree);

  function openCreate() {
    setEditing(null);
    setName("");
    setDescription("");
    setRows([{ ministry_id: "", slots: "1" }]);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(t: ScheduleTemplate) {
    setEditing(t);
    setName(t.name);
    setDescription(t.description ?? "");
    setRows(
      t.ministries.length > 0
        ? t.ministries.map((m) => ({ ministry_id: m.ministry_id, slots: String(m.slots) }))
        : [{ ministry_id: "", slots: "1" }]
    );
    setFormError(null);
    setFormOpen(true);
  }

  async function submit() {
    const filled = rows.filter((r) => r.ministry_id);
    if (!name.trim()) {
      setFormError("Dê um nome ao template.");
      return;
    }
    if (filled.length === 0) {
      setFormError("Escolha ao menos um ministério.");
      return;
    }
    const ids = filled.map((r) => r.ministry_id);
    if (new Set(ids).size !== ids.length) {
      setFormError("Há ministério repetido.");
      return;
    }
    const ministries = filled.map((r) => ({
      ministry_id: r.ministry_id,
      slots: Number(r.slots) || 1,
    }));
    if (ministries.some((m) => !Number.isInteger(m.slots) || m.slots < 1)) {
      setFormError("Vagas precisa ser um inteiro maior que zero.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        ministries,
      };
      if (editing) {
        // PATCH com `ministries` substitui a lista inteira — é o que faz o
        // formulário refletir exatamente o que está na tela.
        await api.patch(`/celebrations/schedule-templates/${editing.id}`, body);
      } else {
        await api.post("/celebrations/schedule-templates", body);
      }
      setFormOpen(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setFormError(errMsg(err, "Não foi possível salvar o template."));
    } finally {
      setSaving(false);
    }
  }

  async function remove(t: ScheduleTemplate) {
    setRemovingId(t.id);
    setError(null);
    try {
      await api.delete(`/celebrations/schedule-templates/${t.id}`);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(errMsg(err, "Não foi possível excluir o template."));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-stone">
          {loaded
            ? `${templates.length} template${templates.length !== 1 ? "s" : ""} de escala`
            : "Carregando…"}
        </p>
        {canEdit ? (
          <Button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-[8px] bg-navy px-3 py-1.5 text-sm text-white hover:bg-navy/90"
          >
            <Plus size={14} strokeWidth={1.5} />
            Novo template
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-[8px] bg-crimson-dim p-3">
          <AlertTriangle size={15} strokeWidth={1.5} className="mt-0.5 flex-shrink-0 text-crimson" />
          <p className="text-sm text-crimson">{error}</p>
        </div>
      ) : null}

      {!loaded ? (
        <div className="flex flex-col gap-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-[12px]" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <LayoutTemplate size={32} strokeWidth={1} className="text-stone" />
          <p className="text-sm text-stone">Nenhum template cadastrado.</p>
          <p className="max-w-sm text-xs text-stone">
            Um template guarda o conjunto de ministérios e vagas que se repete. Ao montar a
            escala de uma celebração, aplicá-lo preenche tudo de uma vez.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {templates.map((t) => (
            <div
              key={t.id}
              className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink dark:text-white">
                    {t.name}
                  </p>
                  {t.description ? (
                    <p className="mt-0.5 truncate text-xs text-stone">{t.description}</p>
                  ) : null}
                </div>
                {canEdit ? (
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(t)}
                      aria-label={`Editar ${t.name}`}
                      className="rounded-[6px] p-1.5 text-stone hover:bg-[var(--surface-subtle)]"
                    >
                      <Pencil size={14} strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(t)}
                      disabled={removingId === t.id}
                      aria-label={`Excluir ${t.name}`}
                      className="rounded-[6px] p-1.5 text-stone hover:bg-crimson-dim hover:text-crimson"
                    >
                      {removingId === t.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} strokeWidth={1.5} />
                      )}
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {t.ministries.length === 0 ? (
                  <span className="text-xs text-stone">Nenhum ministério</span>
                ) : (
                  t.ministries.map((m) => (
                    <span
                      key={m.id}
                      className="flex items-center gap-1 rounded-full bg-[var(--surface-subtle)] px-2 py-0.5 text-xs text-stone"
                    >
                      <Users size={10} strokeWidth={1.5} />
                      {m.ministry.name}
                      <span className="font-medium text-ink dark:text-white">{m.slots}</span>
                    </span>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Formulário ── */}
      <Modal
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? "Editar template" : "Novo template"}
        description="Ministérios e vagas que serão aplicados de uma vez ao montar uma escala."
        className="max-w-lg"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tpl-name" className="text-xs">
              Nome
            </Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              placeholder="Ex.: Culto de domingo"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tpl-desc" className="text-xs">
              Descrição (opcional)
            </Label>
            <Input
              id="tpl-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs">Ministérios e vagas</Label>
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  aria-label={`Ministério ${i + 1}`}
                  value={row.ministry_id}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r, j) => (j === i ? { ...r, ministry_id: e.target.value } : r))
                    )
                  }
                  disabled={saving || !ministriesLoaded}
                  className="h-9 flex-1 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
                >
                  <option value="">
                    {ministriesLoaded ? "Selecione…" : "Carregando ministérios…"}
                  </option>
                  {ministryOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {`${"  ".repeat(opt.depth)}${opt.depth > 0 ? "└ " : ""}${opt.name}`}
                    </option>
                  ))}
                </select>
                <Input
                  aria-label={`Vagas ${i + 1}`}
                  type="number"
                  min={1}
                  value={row.slots}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r, j) => (j === i ? { ...r, slots: e.target.value } : r))
                    )
                  }
                  disabled={saving}
                  className="h-9 w-20"
                />
                <button
                  type="button"
                  onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                  disabled={saving || rows.length === 1}
                  aria-label={`Remover linha ${i + 1}`}
                  className={cn(
                    "rounded-[6px] p-1.5 text-stone",
                    rows.length === 1
                      ? "cursor-not-allowed opacity-40"
                      : "hover:bg-crimson-dim hover:text-crimson"
                  )}
                >
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>
            ))}
            {ministriesLoaded && ministryOptions.length === 0 ? (
              <p className="text-xs text-crimson">
                Nenhum ministério cadastrado. Crie ministérios em Voluntários antes de montar
                um template.
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => setRows((prev) => [...prev, { ministry_id: "", slots: "1" }])}
              disabled={saving}
              className="flex w-fit items-center gap-1 text-xs text-navy hover:underline"
            >
              <Plus size={12} strokeWidth={1.5} />
              Adicionar ministério
            </button>
          </div>

          {formError ? (
            <div className="flex items-start gap-2 rounded-[8px] bg-crimson-dim p-3">
              <AlertTriangle
                size={15}
                strokeWidth={1.5}
                className="mt-0.5 flex-shrink-0 text-crimson"
              />
              <p className="text-sm text-crimson">{formError}</p>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              disabled={saving}
              className="rounded-[8px] px-3 py-1.5 text-sm text-stone hover:bg-[var(--surface-subtle)]"
            >
              Cancelar
            </button>
            <Button
              type="button"
              onClick={submit}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-[8px] bg-navy px-3 py-1.5 text-sm text-white hover:bg-navy/90 disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {editing ? "Salvar" : "Criar"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
