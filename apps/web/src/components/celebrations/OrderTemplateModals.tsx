"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, LayoutTemplate, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrderTemplateItem {
  id: string;
  name: string;
  sequence: number;
  duration_minutes: number;
  entry_kind: "program" | "logistics";
}

export interface OrderTemplate {
  id: string;
  name: string;
  description: string | null;
  items: OrderTemplateItem[];
}

/** "8 etapas · 75 min": o tempo é só o do programa, a equipe não ocupa o culto. */
export function summarizeOrderTemplate(template: OrderTemplate): string {
  const steps = template.items.length;
  const minutes = template.items
    .filter((i) => i.entry_kind === "program")
    .reduce((sum, i) => sum + i.duration_minutes, 0);
  return `${steps} ${steps === 1 ? "etapa" : "etapas"} · ${minutes} min`;
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-[8px] bg-crimson-dim p-3">
      <AlertTriangle size={15} strokeWidth={1.5} className="mt-0.5 flex-shrink-0 text-crimson" />
      <p className="text-sm text-crimson">{message}</p>
    </div>
  );
}

// ─── Salvar a OC como molde ───────────────────────────────────────────────────

interface SaveOrderTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceOrderId: string;
  /** Sugestão de nome: o da celebração. */
  defaultName: string;
  onSaved: () => void;
}

export function SaveOrderTemplateModal({
  open,
  onOpenChange,
  serviceOrderId,
  defaultName,
  onSaved,
}: SaveOrderTemplateModalProps) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // O pai controla `open` e o Modal só avisa quando pedem para fechar (Esc,
  // clique fora), então reabrir não passa por aqui: o que sobrou do uso
  // anterior é limpo no fechamento. Quem troca de OC remonta o modal
  // (`key` no pai), e é isso que renova `defaultName`.
  function close() {
    setName(defaultName);
    setDescription("");
    setError(null);
    onOpenChange(false);
  }

  async function submit() {
    if (!name.trim()) {
      setError("Dê um nome ao molde.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post("/celebrations/order-templates", {
        name: name.trim(),
        description: description.trim() || undefined,
        service_order_id: serviceOrderId,
      });
      close();
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err, "Não foi possível salvar o molde."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title="Salvar como molde"
      description="Guarda as etapas, os horários e os responsáveis desta ordem. As músicas e a escala não entram."
      className="max-w-md"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ot-name" className="text-xs">
            Nome
          </Label>
          <Input
            id="ot-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
            maxLength={120}
            placeholder="Ex.: Culto de domingo"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ot-desc" className="text-xs">
            Descrição (opcional)
          </Label>
          <Input
            id="ot-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={saving}
            maxLength={500}
          />
        </div>

        {error ? <ErrorNote message={error} /> : null}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={close}
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
            Salvar molde
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Aplicar um molde à OC ────────────────────────────────────────────────────

interface ApplyOrderTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceOrderId: string;
  /** A OC já tem etapas: aí é preciso escolher entre acrescentar e substituir. */
  hasItems: boolean;
  onApplied: (created: number) => void;
}

export function ApplyOrderTemplateModal({
  open,
  onOpenChange,
  serviceOrderId,
  hasItems,
  onApplied,
}: ApplyOrderTemplateModalProps) {
  // `null` é "carregando": a lista é buscada a cada abertura, porque um molde
  // salvo agora há pouco na mesma tela tem que aparecer.
  const [templates, setTemplates] = useState<OrderTemplate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replace, setReplace] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const signal = { cancelled: false };
    api
      .get<OrderTemplate[]>("/celebrations/order-templates")
      .then(({ data }) => {
        if (signal.cancelled) return;
        setTemplates(Array.isArray(data) ? data : []);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (signal.cancelled) return;
        setTemplates([]);
        setLoadError(apiErrorMessage(err, "Não foi possível carregar os moldes."));
      });
    return () => {
      signal.cancelled = true;
    };
  }, [open]);

  function close() {
    setTemplates(null);
    setLoadError(null);
    setSelectedId(null);
    setReplace(false);
    setError(null);
    onOpenChange(false);
  }

  async function submit() {
    if (!selectedId) return;
    setApplying(true);
    setError(null);
    try {
      const { data } = await api.post<{ created: number }>(
        `/celebrations/order-templates/${selectedId}/apply`,
        { service_order_id: serviceOrderId, replace: hasItems && replace },
      );
      close();
      onApplied(data.created);
    } catch (err) {
      setError(apiErrorMessage(err, "Não foi possível aplicar o molde."));
    } finally {
      setApplying(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title="Aplicar molde"
      description="Copia as etapas do molde para esta ordem de culto. Depois de aplicadas, dá para ajustar uma a uma."
      className="max-w-lg"
    >
      <div className="flex flex-col gap-4">
        {templates === null ? (
          <div className="flex flex-col gap-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-[8px]" />
            ))}
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <LayoutTemplate size={28} strokeWidth={1} className="text-stone" />
            <p className="text-sm text-stone">Nenhum molde salvo.</p>
            <p className="max-w-xs text-xs text-stone">
              Monte uma ordem de culto e use Salvar como molde para reaproveitá-la nos próximos
              cultos.
            </p>
          </div>
        ) : (
          <div role="radiogroup" aria-label="Moldes" className="flex flex-col gap-2">
            {templates.map((t) => (
              <label
                key={t.id}
                className="flex cursor-pointer items-start gap-3 rounded-[8px] border border-[var(--border-default)] p-3 has-[:checked]:border-navy has-[:checked]:bg-[var(--surface-subtle)]"
              >
                <input
                  type="radio"
                  name="order-template"
                  value={t.id}
                  checked={selectedId === t.id}
                  onChange={() => setSelectedId(t.id)}
                  disabled={applying}
                  className="mt-1"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-ink dark:text-white">
                    {t.name}
                  </span>
                  <span className="text-xs text-stone">{summarizeOrderTemplate(t)}</span>
                  {t.description ? (
                    <span className="mt-0.5 truncate text-xs text-stone">{t.description}</span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        )}

        {loadError ? <ErrorNote message={loadError} /> : null}

        {hasItems && templates !== null && templates.length > 0 ? (
          <fieldset className="flex flex-col gap-2" disabled={applying}>
            <legend className="mb-1 text-xs font-medium text-ink dark:text-white">
              Esta ordem já tem etapas
            </legend>
            <label className="flex items-center gap-2 text-sm text-ink dark:text-white">
              <input type="radio" name="apply-mode" checked={!replace} onChange={() => setReplace(false)} />
              Acrescentar depois das etapas atuais
            </label>
            <label className="flex items-center gap-2 text-sm text-ink dark:text-white">
              <input type="radio" name="apply-mode" checked={replace} onChange={() => setReplace(true)} />
              Substituir as etapas atuais
            </label>
            {replace ? (
              <p className="text-xs text-crimson">
                As etapas atuais e as músicas escolhidas nelas serão apagadas.
              </p>
            ) : null}
          </fieldset>
        ) : null}

        {error ? <ErrorNote message={error} /> : null}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={close}
            disabled={applying}
            className="rounded-[8px] px-3 py-1.5 text-sm text-stone hover:bg-[var(--surface-subtle)]"
          >
            Cancelar
          </button>
          <Button
            type="button"
            onClick={submit}
            disabled={applying || !selectedId}
            className="flex items-center gap-1.5 rounded-[8px] bg-navy px-3 py-1.5 text-sm text-white hover:bg-navy/90 disabled:opacity-50"
          >
            {applying ? <Loader2 size={14} className="animate-spin" /> : null}
            Aplicar molde
          </Button>
        </div>
      </div>
    </Modal>
  );
}
