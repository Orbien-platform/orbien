"use client";

import { useEffect, useRef, useState } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { Dialog } from "@base-ui/react/dialog";
import { Loader2, Plus, Pencil, Trash2, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

interface Category {
  id: string;
  name: string;
  type: "income" | "expense";
  parent_id: string | null;
  description: string | null;
  is_system: boolean;
  children: Category[];
}

interface CategoriesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

type CatType = "income" | "expense";

interface FormState {
  id: string | null;
  name: string;
  type: CatType;
  parentId: string;
  description: string;
}

function emptyForm(type: CatType): FormState {
  return { id: null, name: "", type, parentId: "", description: "" };
}

export function CategoriesModal({ open, onOpenChange, onChanged }: CategoriesModalProps) {
  const [activeTab, setActiveTab] = useState<CatType>("income");
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const hasFetched = useRef(false);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm("income"));
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
      .get<Category[]>("/financial/categories")
      .then((r) => setCategories(r.data ?? []))
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

  const tabCategories = categories.filter((c) => c.type === activeTab);
  const topLevel = tabCategories.filter((c) => !c.parent_id);

  function openCreate() {
    setForm(emptyForm(activeTab));
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(cat: Category) {
    setForm({
      id: cat.id,
      name: cat.name,
      type: cat.type,
      parentId: cat.parent_id ?? "",
      description: cat.description ?? "",
    });
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
        type: form.type,
        parent_id: form.parentId || null,
        description: form.description.trim() || null,
      };
      if (form.id) {
        await api.patch(`/financial/categories/${form.id}`, payload);
        showToast("Categoria atualizada");
      } else {
        await api.post("/financial/categories", payload);
        showToast("Categoria criada");
      }
      setFormOpen(false);
      refresh();
    } catch {
      setFormError(form.id ? "Erro ao atualizar categoria." : "Erro ao criar categoria.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const categoryToDelete = categories.find((c) => c.id === confirmDeleteId) ?? null;
  const hasChildren = !!categoryToDelete && categoryToDelete.children.length > 0;

  async function handleDelete() {
    if (!confirmDeleteId) return;
    setDeletingId(confirmDeleteId);
    try {
      await api.delete(`/financial/categories/${confirmDeleteId}`);
      setConfirmDeleteId(null);
      showToast("Categoria excluída");
      refresh();
    } catch {
      showToast("Erro ao excluir categoria.");
    } finally {
      setDeletingId(null);
    }
  }

  function CategoryRow({ cat, indent }: { cat: Category; indent: boolean }) {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-2 border-b border-[var(--border-default)] py-2.5",
          indent && "pl-6"
        )}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink dark:text-white">{cat.name}</span>
          {cat.is_system && (
            <Badge variant="secondary" className="bg-[var(--surface-subtle)] text-stone">
              Sistema
            </Badge>
          )}
        </div>
        {!cat.is_system && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              className="rounded-[8px]"
              aria-label="Editar categoria"
              onClick={() => openEdit(cat)}
            >
              <Pencil size={13} strokeWidth={1.5} />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              className="rounded-[8px] text-crimson hover:bg-crimson-dim"
              aria-label="Excluir categoria"
              onClick={() => setConfirmDeleteId(cat.id)}
            >
              <Trash2 size={13} strokeWidth={1.5} />
            </Button>
          </div>
        )}
      </div>
    );
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
                  Categorias financeiras
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 text-sm text-stone">
                  Gerencie as categorias de receitas e despesas.
                </Dialog.Description>
              </div>
              <Dialog.Close
                className="flex h-7 w-7 items-center justify-center rounded-[8px] text-stone transition-colors hover:bg-[var(--surface-subtle)] hover:text-ink"
                aria-label="Fechar"
              >
                <X size={15} strokeWidth={1.5} />
              </Dialog.Close>
            </div>

            <Tabs.Root
              value={activeTab}
              onValueChange={(val) => setActiveTab(val as CatType)}
            >
              <Tabs.List className="flex border-b border-[var(--border-default)]">
                <Tabs.Tab
                  value="income"
                  className={cn(
                    "relative px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none",
                    activeTab === "income"
                      ? "text-navy dark:text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-navy"
                      : "text-stone hover:text-ink dark:hover:text-white"
                  )}
                >
                  Receitas
                </Tabs.Tab>
                <Tabs.Tab
                  value="expense"
                  className={cn(
                    "relative px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none",
                    activeTab === "expense"
                      ? "text-navy dark:text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-navy"
                      : "text-stone hover:text-ink dark:hover:text-white"
                  )}
                >
                  Despesas
                </Tabs.Tab>
              </Tabs.List>

              <div className="flex items-center justify-end pt-4">
                <Button
                  size="sm"
                  className="gap-1.5 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)]"
                  onClick={openCreate}
                >
                  <Plus size={14} strokeWidth={1.5} />
                  Nova categoria
                </Button>
              </div>

              <Tabs.Panel value={activeTab} className="pt-3">
                {isLoading ? (
                  <div className="py-10 text-center text-sm text-stone">Carregando…</div>
                ) : topLevel.length === 0 ? (
                  <p className="py-10 text-center text-sm text-stone">
                    Nenhuma categoria cadastrada.
                  </p>
                ) : (
                  <div>
                    {topLevel.map((cat) => (
                      <div key={cat.id}>
                        <CategoryRow cat={cat} indent={false} />
                        {cat.children.map((child) => (
                          <CategoryRow key={child.id} cat={child} indent />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </Tabs.Panel>
            </Tabs.Root>
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
                {form.id ? "Editar categoria" : "Nova categoria"}
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
                <Label htmlFor="cat-name" className="text-sm font-medium text-ink dark:text-white">
                  Nome <span className="text-crimson">*</span>
                </Label>
                <Input
                  id="cat-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  disabled={isSubmitting}
                  className="rounded-[8px]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-medium text-ink dark:text-white">Tipo</Label>
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, type: e.target.value as CatType, parentId: "" }))
                  }
                  disabled={isSubmitting}
                  className="h-9 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
                >
                  <option value="income">Receita</option>
                  <option value="expense">Despesa</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-medium text-ink dark:text-white">
                  Categoria pai (opcional)
                </Label>
                <select
                  value={form.parentId}
                  onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
                  disabled={isSubmitting}
                  className="h-9 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
                >
                  <option value="">— Nenhuma —</option>
                  {categories
                    .filter((c) => c.type === form.type && !c.parent_id && c.id !== form.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cat-desc" className="text-sm font-medium text-ink dark:text-white">
                  Descrição (opcional)
                </Label>
                <textarea
                  id="cat-desc"
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
      {confirmDeleteId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-[12px] bg-[var(--surface-card)] p-5">
            <p className="text-sm font-medium text-ink dark:text-white">Excluir categoria?</p>
            <p className="mt-1.5 text-sm text-stone">Esta ação não pode ser desfeita.</p>
            {hasChildren && (
              <p className="mt-2 rounded-[8px] bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Esta categoria possui subcategorias que também serão afetadas.
              </p>
            )}
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
