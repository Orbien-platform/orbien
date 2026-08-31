"use client";

import { useMemo, useState, type FormEvent } from "react";
import axios from "axios";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { flattenMinistryTree, type MinistryTreeNode } from "@/lib/ministryTree";
import api from "@/lib/api";

// ─── Color presets ─────────────────────────────────────────────────────────────

export const MINISTRY_COLORS = [
  { label: "Azul", value: "#1E3A5F" },
  { label: "Teal", value: "#0D9488" },
  { label: "Índigo", value: "#4F46E5" },
  { label: "Verde", value: "#16A34A" },
  { label: "Âmbar", value: "#D97706" },
  { label: "Vermelho", value: "#DC2626" },
  { label: "Rosa", value: "#DB2777" },
  { label: "Roxo", value: "#7C3AED" },
] as const;

const DEFAULT_COLOR = MINISTRY_COLORS[0].value;

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreateMinistryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tree: MinistryTreeNode[];
  onCreated: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CreateMinistryModal({
  open,
  onOpenChange,
  tree,
  onCreated,
}: CreateMinistryModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [parentId, setParentId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  const [success, setSuccess] = useState(false);

  const hasRoot = tree.length > 0;
  const parentOptions = useMemo(() => flattenMinistryTree(tree), [tree]);

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 4000);
  }

  function reset() {
    setName("");
    setDescription("");
    setColor(DEFAULT_COLOR);
    setParentId("");
    setError("");
    setToastMsg("");
    setSuccess(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Nome é obrigatório."); return; }
    if (hasRoot && !parentId) {
      setError("Já existe um ministério principal. Selecione um ministério pai.");
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      await api.post("/volunteers/ministries", {
        name: name.trim(),
        description: description.trim() || undefined,
        color,
        parent_ministry_id: parentId || undefined,
      });
      setSuccess(true);
      setTimeout(() => {
        onCreated();
        onOpenChange(false);
        reset();
      }, 1200);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        showToast(err.response.data?.message ?? "Já existe um ministério raiz.");
      } else if (axios.isAxiosError(err) && err.response?.status === 400) {
        showToast(err.response.data?.message ?? "Dados inválidos.");
      } else {
        showToast("Erro ao criar ministério. Tente novamente.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
    <Modal
      open={open}
      onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}
      title="Novo ministério"
      className="max-w-md"
    >
      {success ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 size={40} className="text-teal" strokeWidth={1.5} />
          <p className="text-sm font-medium text-ink dark:text-white">
            Ministério criado com sucesso!
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {/* Nome */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cm-name" className="text-sm font-medium text-ink dark:text-white">
              Nome <span className="text-crimson">*</span>
            </Label>
            <Input
              id="cm-name"
              placeholder="ex: Louvor e Adoração"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
              className="rounded-[8px]"
            />
          </div>

          {/* Descrição */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cm-desc" className="text-sm font-medium text-ink dark:text-white">
              Descrição <span className="text-xs font-normal text-stone">(opcional)</span>
            </Label>
            <textarea
              id="cm-desc"
              rows={2}
              placeholder="Breve descrição do ministério…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-2 text-sm text-ink placeholder:text-stone focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white resize-none"
            />
          </div>

          {/* Ministério pai */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cm-parent" className="text-sm font-medium text-ink dark:text-white">
              Ministério pai
            </Label>
            <select
              id="cm-parent"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              disabled={isSubmitting}
              className="h-9 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
            >
              <option
                value=""
                disabled={hasRoot}
                title={hasRoot ? "Já existe um ministério principal" : undefined}
              >
                Nenhum (ministério raiz)
              </option>
              {parentOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {"  ".repeat(m.depth)}
                  {m.depth > 0 ? "↳ " : ""}
                  {m.name}
                </option>
              ))}
            </select>
            {hasRoot && (
              <p className="text-xs text-stone">
                Já existe um ministério principal. Selecione um ministério pai para criar um sub-ministério.
              </p>
            )}
          </div>

          {/* Cor */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-ink dark:text-white">Cor</Label>
            <div className="flex flex-wrap gap-2">
              {MINISTRY_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  aria-label={c.label}
                  onClick={() => setColor(c.value)}
                  disabled={isSubmitting}
                  className={cn(
                    "h-7 w-7 rounded-full border-2 transition-transform hover:scale-110",
                    color === c.value ? "border-ink dark:border-white scale-110" : "border-transparent"
                  )}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
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
              {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : "Criar ministério"}
            </Button>
          </div>
        </form>
      )}
    </Modal>

    {toastMsg && (
      <div className="fixed bottom-4 right-4 z-[80] rounded-[8px] bg-ink px-4 py-2.5 text-sm text-white shadow-lg dark:bg-white dark:text-ink">
        {toastMsg}
      </div>
    )}
    </>
  );
}
