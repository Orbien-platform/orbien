"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Loader2, Plus, Pencil, Trash2, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

interface CostCenter {
  id: string;
  name: string;
  description: string | null;
}

interface CostCentersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

interface FormState {
  id: string | null;
  name: string;
  description: string;
}

function emptyForm(): FormState {
  return { id: null, name: "", description: "" };
}

export function CostCentersModal({ open, onOpenChange, onChanged }: CostCentersModalProps) {
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const hasFetched = useRef(false);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [toastMsg, setToastMsg] = useState("");

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3000);
  }

  function load() {
    setIsLoading(true);
    api
      .get<CostCenter[]>("/financial/cost-centers")
      .then((r) => setCostCenters(r.data ?? []))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    if (!open || hasFetched.current) return;
    hasFetched.current = true;
    load();
  }, [open]);

  useEffect(() => {
    if (!open) hasFetched.current = false;
  }, [open]);

  function refresh() {
    load();
    onChanged();
  }

  function openCreate() {
    setForm(emptyForm());
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(cc: CostCenter) {
    setForm({ id: cc.id, name: cc.name, description: cc.description ?? "" });
    setFormError("");
    setFormOpen(true);
  }

  async function handleSubmit() {
    setFormError("");
    if (!form.name.trim()) {
      setFormError("Nome é obrigatório.");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
      };
      if (form.id) {
        await api.patch(`/financial/cost-centers/${form.id}`, payload);
        showToast("Centro de custo atualizado");
      } else {
        await api.post("/financial/cost-centers", payload);
        showToast("Centro de custo criado");
      }
      setFormOpen(false);
      refresh();
    } catch {
      setFormError(form.id ? "Erro ao atualizar centro de custo." : "Erro ao criar centro de custo.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!confirmDeleteId) return;
    setDeletingId(confirmDeleteId);
    try {
      await api.delete(`/financial/cost-centers/${confirmDeleteId}`);
      setConfirmDeleteId(null);
      showToast("Centro de custo excluído");
      refresh();
    } catch {
      showToast("Erro ao excluir centro de custo.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl max-h-[85vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[16px] border border-[var(--border-default)] bg-[var(--surface-base)] p-6 shadow-[var(--shadow-lg)] transition duration-150 data-ending-style:opacity-0 data-ending-style:scale-95 data-starting-style:opacity-0 data-starting-style:scale-95">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <Dialog.Title className="text-base font-medium text-ink dark:text-white">
                  Centros de custo
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 text-sm text-stone">
                  Gerencie os centros de custo usados nos lançamentos.
                </Dialog.Description>
              </div>
              <Dialog.Close
                className="flex h-7 w-7 items-center justify-center rounded-[8px] text-stone transition-colors hover:bg-[var(--surface-subtle)] hover:text-ink"
                aria-label="Fechar"
              >
                <X size={15} strokeWidth={1.5} />
              </Dialog.Close>
            </div>

            <div className="flex items-center justify-end pb-3">
              <Button
                size="sm"
                className="gap-1.5 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)]"
                onClick={openCreate}
              >
                <Plus size={14} strokeWidth={1.5} />
                Novo centro de custo
              </Button>
            </div>

            {isLoading ? (
              <div className="py-10 text-center text-sm text-stone">Carregando…</div>
            ) : costCenters.length === 0 ? (
              <p className="py-10 text-center text-sm text-stone">
                Nenhum centro de custo cadastrado.
              </p>
            ) : (
              <div>
                {costCenters.map((cc) => (
                  <div
                    key={cc.id}
                    className="flex items-center justify-between gap-2 border-b border-[var(--border-default)] py-2.5"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm text-ink dark:text-white">{cc.name}</span>
                      {cc.description && (
                        <span className="text-xs text-stone">{cc.description}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon-sm"
                        className="rounded-[8px]"
                        aria-label="Editar centro de custo"
                        onClick={() => openEdit(cc)}
                      >
                        <Pencil size={13} strokeWidth={1.5} />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        className="rounded-[8px] text-crimson hover:bg-crimson-dim"
                        aria-label="Excluir centro de custo"
                        onClick={() => setConfirmDeleteId(cc.id)}
                      >
                        <Trash2 size={13} strokeWidth={1.5} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Create / edit form */}
      <Dialog.Root open={formOpen} onOpenChange={setFormOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 z-[60] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[16px] border border-[var(--border-default)] bg-[var(--surface-base)] p-6 shadow-[var(--shadow-lg)] transition duration-150 data-ending-style:opacity-0 data-ending-style:scale-95 data-starting-style:opacity-0 data-starting-style:scale-95">
            <div className="mb-4 flex items-start justify-between gap-3">
              <Dialog.Title className="text-base font-medium text-ink dark:text-white">
                {form.id ? "Editar centro de custo" : "Novo centro de custo"}
              </Dialog.Title>
              <Dialog.Close
                className="flex h-7 w-7 items-center justify-center rounded-[8px] text-stone transition-colors hover:bg-[var(--surface-subtle)] hover:text-ink"
                aria-label="Fechar"
              >
                <X size={15} strokeWidth={1.5} />
              </Dialog.Close>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cc-name" className="text-sm font-medium text-ink dark:text-white">
                  Nome <span className="text-crimson">*</span>
                </Label>
                <Input
                  id="cc-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  disabled={isSubmitting}
                  className="rounded-[8px]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cc-desc" className="text-sm font-medium text-ink dark:text-white">
                  Descrição (opcional)
                </Label>
                <textarea
                  id="cc-desc"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  disabled={isSubmitting}
                  rows={3}
                  className="rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
                />
              </div>

              {formError && (
                <p className="rounded-[8px] bg-crimson-dim px-3 py-2 text-sm text-crimson">
                  {formError}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 rounded-[8px]"
                  onClick={() => setFormOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="flex-1 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)]"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : "Salvar"}
                </Button>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete confirmation */}
      <Dialog.Root
        open={confirmDeleteId !== null}
        onOpenChange={(v) => { if (!v) setConfirmDeleteId(null); }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-[70] bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 z-[70] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[12px] bg-[var(--surface-card)] p-5 transition duration-150 data-ending-style:opacity-0 data-ending-style:scale-95 data-starting-style:opacity-0 data-starting-style:scale-95">
            <Dialog.Title className="text-sm font-medium text-ink dark:text-white">
              Excluir centro de custo?
            </Dialog.Title>
            <Dialog.Description className="mt-1.5 text-sm text-stone">
              Esta ação não pode ser desfeita.
            </Dialog.Description>
            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                className="flex-1 rounded-[8px]"
                onClick={() => setConfirmDeleteId(null)}
                disabled={deletingId === confirmDeleteId}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 rounded-[8px] bg-crimson text-white hover:opacity-90"
                onClick={handleDelete}
                disabled={deletingId === confirmDeleteId}
              >
                {deletingId === confirmDeleteId ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  "Excluir"
                )}
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      {toastMsg && (
        <div className="fixed bottom-4 right-4 z-[80] rounded-[8px] bg-ink px-4 py-2.5 text-sm text-white shadow-lg dark:bg-white dark:text-ink">
          {toastMsg}
        </div>
      )}
    </>
  );
}
