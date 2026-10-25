"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, LayoutTemplate, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { summarizeOrderTemplate, type OrderTemplate } from "@/components/celebrations/OrderTemplateModals";

/** Quantas etapas aparecem como resumo no cartão; o resto vira "+N". */
const PREVIEW_STEPS = 5;

/**
 * Moldes de ordem de culto. Diferente do molde de escala, este não se cria
 * aqui: nasce de uma OC já montada (Salvar como molde), porque é a OC que
 * tem horários e responsáveis para copiar. Aqui só se renomeia e se exclui.
 */
export function OrderTemplatesPanel({ canEdit }: { canEdit: boolean }) {
  const [templates, setTemplates] = useState<OrderTemplate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [editing, setEditing] = useState<OrderTemplate | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    const signal = { cancelled: false };
    api
      .get<OrderTemplate[]>("/celebrations/order-templates")
      .then(({ data }) => {
        if (signal.cancelled) return;
        setTemplates(Array.isArray(data) ? data : []);
        setError(null);
      })
      .catch((err: unknown) => {
        if (signal.cancelled) return;
        setError(apiErrorMessage(err, "Não foi possível carregar os moldes."));
      })
      .finally(() => {
        if (!signal.cancelled) setLoaded(true);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [reloadKey]);

  function openEdit(t: OrderTemplate) {
    setEditing(t);
    setName(t.name);
    setDescription(t.description ?? "");
    setFormError(null);
  }

  async function submit(target: OrderTemplate) {
    if (!name.trim()) {
      setFormError("Dê um nome ao molde.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await api.patch(`/celebrations/order-templates/${target.id}`, {
        name: name.trim(),
        description: description.trim(),
      });
      setEditing(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setFormError(apiErrorMessage(err, "Não foi possível salvar o molde."));
    } finally {
      setSaving(false);
    }
  }

  async function remove(t: OrderTemplate) {
    setRemovingId(t.id);
    setError(null);
    try {
      await api.delete(`/celebrations/order-templates/${t.id}`);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(apiErrorMessage(err, "Não foi possível excluir o molde."));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-stone">
        {loaded
          ? `${templates.length} ${templates.length === 1 ? "molde" : "moldes"} de ordem de culto`
          : "Carregando…"}
      </p>

      {error ? (
        <div role="alert" className="flex items-start gap-2 rounded-[8px] bg-crimson-dim p-3">
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
          <p className="text-sm text-stone">Nenhum molde de ordem de culto.</p>
          <p className="max-w-sm text-xs text-stone">
            Monte a ordem de um culto em Próximas e use Salvar como molde. Nos próximos cultos, Aplicar
            molde traz as etapas, os horários e os responsáveis de uma vez.
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
                  <p className="truncate text-sm font-medium text-ink dark:text-white">{t.name}</p>
                  <p className="mt-0.5 text-xs text-stone">{summarizeOrderTemplate(t)}</p>
                  {t.description ? (
                    <p className="mt-0.5 truncate text-xs text-stone">{t.description}</p>
                  ) : null}
                </div>
                {canEdit ? (
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(t)}
                      aria-label={`Renomear ${t.name}`}
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

              <ol className="mt-3 flex flex-wrap gap-1.5">
                {t.items.slice(0, PREVIEW_STEPS).map((i) => (
                  <li
                    key={i.id}
                    className="rounded-full bg-[var(--surface-subtle)] px-2 py-0.5 text-xs text-stone"
                  >
                    {i.name}
                  </li>
                ))}
                {t.items.length > PREVIEW_STEPS ? (
                  <li className="px-1 py-0.5 text-xs text-stone">
                    +{t.items.length - PREVIEW_STEPS}
                  </li>
                ) : null}
              </ol>
            </div>
          ))}
        </div>
      )}

      {editing ? (
        <Modal
          open
          onOpenChange={() => setEditing(null)}
          title="Renomear molde"
          description="Muda só o nome e a descrição. As etapas do molde ficam como estão."
          className="max-w-md"
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="otp-name" className="text-xs">
                Nome
              </Label>
              <Input
                id="otp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
                maxLength={120}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="otp-desc" className="text-xs">
                Descrição (opcional)
              </Label>
              <Input
                id="otp-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={saving}
                maxLength={500}
              />
            </div>

            {formError ? (
              <div role="alert" className="flex items-start gap-2 rounded-[8px] bg-crimson-dim p-3">
                <AlertTriangle size={15} strokeWidth={1.5} className="mt-0.5 flex-shrink-0 text-crimson" />
                <p className="text-sm text-crimson">{formError}</p>
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={saving}
                className="rounded-[8px] px-3 py-1.5 text-sm text-stone hover:bg-[var(--surface-subtle)]"
              >
                Cancelar
              </button>
              <Button
                type="button"
                onClick={() => submit(editing)}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-[8px] bg-navy px-3 py-1.5 text-sm text-white hover:bg-navy/90 disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                Salvar
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
