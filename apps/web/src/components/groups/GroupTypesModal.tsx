"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Dialog } from "@base-ui/react/dialog";
import { Loader2, Pencil, Plus, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { fetchGroupTypes, DEFAULT_GROUP_TYPE_COLOR, type GroupTypeDef } from "@/lib/groupTypes";
import api from "@/lib/api";

const HEX_COLOR_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

interface GroupTypesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

interface FormState {
  id: string | null;
  name: string;
  color: string;
}

function emptyForm(): FormState {
  return { id: null, name: "", color: "" };
}

export function GroupTypesModal({ open, onOpenChange, onChanged }: GroupTypesModalProps) {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const canDeactivate = roles.includes("admin_congregation") || roles.includes("tenant_admin");

  const [types, setTypes] = useState<GroupTypeDef[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const hasFetched = useRef(false);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);

  const [toastMsg, setToastMsg] = useState("");

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 4000);
  }

  function load() {
    setIsLoading(true);
    fetchGroupTypes(true)
      .then(setTypes)
      .catch(() => setTypes([]))
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

  function openEdit(t: GroupTypeDef) {
    setForm({ id: t.id, name: t.name, color: t.color ?? "" });
    setFormError("");
    setFormOpen(true);
  }

  async function handleSubmit() {
    setFormError("");
    if (!form.name.trim()) {
      setFormError("Nome é obrigatório.");
      return;
    }
    const color = form.color.trim();
    if (color && !HEX_COLOR_RE.test(color)) {
      setFormError("Cor inválida. Use um hexadecimal, ex: #1C3D5A.");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = { name: form.name.trim(), color: color || undefined };
      if (form.id) {
        await api.patch(`/groups/types/${form.id}`, payload);
        showToast("Tipo atualizado");
      } else {
        await api.post("/groups/types", payload);
        showToast("Tipo criado");
      }
      setFormOpen(false);
      refresh();
    } catch {
      setFormError(form.id ? "Erro ao atualizar tipo." : "Erro ao criar tipo.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeactivate() {
    if (!confirmDeactivateId) return;
    setIsDeactivating(true);
    try {
      await api.patch(`/groups/types/${confirmDeactivateId}/deactivate`);
      setConfirmDeactivateId(null);
      showToast("Tipo desativado");
      refresh();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        showToast(err.response.data?.message ?? "Não é possível desativar este tipo.");
      } else {
        showToast("Erro ao desativar tipo.");
      }
      setConfirmDeactivateId(null);
    } finally {
      setIsDeactivating(false);
    }
  }

  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-full max-w-md max-h-[85vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[16px] border border-[var(--border-default)] bg-[var(--surface-base)] p-6 shadow-[var(--shadow-lg)] transition duration-150 data-ending-style:opacity-0 data-ending-style:scale-95 data-starting-style:opacity-0 data-starting-style:scale-95">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <Dialog.Title className="text-base font-medium text-ink dark:text-white">
                  Tipos de grupo
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 text-sm text-stone">
                  Gerencie os tipos disponíveis para os grupos.
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
                Novo tipo
              </Button>
            </div>

            {isLoading ? (
              <div className="py-10 text-center text-sm text-stone">Carregando…</div>
            ) : types.length === 0 ? (
              <p className="py-10 text-center text-sm text-stone">Nenhum tipo cadastrado.</p>
            ) : (
              <div>
                {types.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-2 border-b border-[var(--border-default)] py-2.5 last:border-0"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: t.color || DEFAULT_GROUP_TYPE_COLOR }}
                      />
                      <span className="truncate text-sm text-ink dark:text-white">{t.name}</span>
                      {!t.is_active && (
                        <Badge variant="secondary" className="bg-[var(--surface-subtle)] text-stone">
                          Inativo
                        </Badge>
                      )}
                    </div>
                    {t.is_active && (
                      <div className="flex flex-shrink-0 items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon-sm"
                          className="rounded-[8px]"
                          aria-label="Editar tipo"
                          onClick={() => openEdit(t)}
                        >
                          <Pencil size={13} strokeWidth={1.5} />
                        </Button>
                        {canDeactivate && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-[8px] text-crimson hover:bg-crimson-dim"
                            onClick={() => setConfirmDeactivateId(t.id)}
                          >
                            Desativar
                          </Button>
                        )}
                      </div>
                    )}
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
          <Dialog.Popup className="fixed left-1/2 top-1/2 z-[60] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[16px] border border-[var(--border-default)] bg-[var(--surface-base)] p-6 shadow-[var(--shadow-lg)] transition duration-150 data-ending-style:opacity-0 data-ending-style:scale-95 data-starting-style:opacity-0 data-starting-style:scale-95">
            <div className="mb-4 flex items-start justify-between gap-3">
              <Dialog.Title className="text-base font-medium text-ink dark:text-white">
                {form.id ? "Editar tipo" : "Novo tipo"}
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
                <Label htmlFor="gt-name" className="text-sm font-medium text-ink dark:text-white">
                  Nome <span className="text-crimson">*</span>
                </Label>
                <Input
                  id="gt-name"
                  placeholder="ex: Núcleo"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  disabled={isSubmitting}
                  className="rounded-[8px]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-medium text-ink dark:text-white">
                  Cor <span className="text-xs font-normal text-stone">(opcional)</span>
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={HEX_COLOR_RE.test(form.color) ? form.color : DEFAULT_GROUP_TYPE_COLOR}
                    onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                    disabled={isSubmitting}
                    className="h-8 w-10 cursor-pointer rounded-[6px] border border-[var(--border-default)] bg-transparent disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <Input
                    value={form.color}
                    onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                    placeholder="#1C3D5A"
                    disabled={isSubmitting}
                    className="rounded-[8px]"
                  />
                </div>
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

      {/* Deactivate confirmation */}
      {confirmDeactivateId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-[12px] bg-[var(--surface-card)] p-5">
            <p className="text-sm font-medium text-ink dark:text-white">Desativar tipo?</p>
            <p className="mt-1.5 text-sm text-stone">
              O tipo deixará de aparecer como opção ao criar novos grupos.
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                className="flex-1 rounded-[8px]"
                onClick={() => setConfirmDeactivateId(null)}
                disabled={isDeactivating}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 rounded-[8px] bg-crimson text-white hover:opacity-90"
                onClick={handleDeactivate}
                disabled={isDeactivating}
              >
                {isDeactivating ? <Loader2 size={14} className="animate-spin" /> : "Desativar"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && (
        <div className="fixed bottom-4 right-4 z-[80] rounded-[8px] bg-ink px-4 py-2.5 text-sm text-white shadow-lg dark:bg-white dark:text-ink">
          {toastMsg}
        </div>
      )}
    </>
  );
}
