"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

interface Segment {
  id: string;
  name: string;
}

interface SendNotificationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent: (result: { delivered?: number }) => void;
}

export function SendNotificationModal({
  open,
  onOpenChange,
  onSent,
}: SendNotificationModalProps) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [deliveredCount, setDeliveredCount] = useState<number | null>(null);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!open || hasFetched.current) return;
    hasFetched.current = true;
    api
      .get<{ data: Segment[] } | Segment[]>("/content/segments?limit=100")
      .then((r) => {
        const d = r.data;
        setSegments(Array.isArray(d) ? d : d.data ?? []);
      })
      .catch(() => {});
  }, [open]);

  function toggleSegment(id: string) {
    setSelectedSegmentIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  function reset() {
    setTitle(""); setMessage(""); setSelectedSegmentIds([]);
    setError(""); setSuccess(false); setDeliveredCount(null);
    hasFetched.current = false;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Título é obrigatório."); return; }
    if (!message.trim()) { setError("Mensagem é obrigatória."); return; }
    setError("");
    setIsSubmitting(true);
    try {
      const { data } = await api.post<{ delivered?: number; count?: number }>(
        "/content/notifications/send",
        {
          title: title.trim(),
          message: message.trim(),
          segment_ids: selectedSegmentIds.length > 0 ? selectedSegmentIds : undefined,
        }
      );
      const count = data.delivered ?? data.count ?? null;
      setDeliveredCount(count);
      setSuccess(true);
      onSent({ delivered: count ?? undefined });
    } catch {
      setError("Erro ao enviar notificação. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}
      title="Enviar notificação"
      description="Envia uma notificação push para os dispositivos dos membros."
      className="max-w-md"
    >
      {success ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 size={40} className="text-teal" strokeWidth={1.5} />
          <p className="text-sm font-medium text-ink dark:text-white">
            Notificação enviada!
          </p>
          {deliveredCount != null && (
            <p className="text-xs text-stone">{deliveredCount} entregue(s)</p>
          )}
          <Button
            onClick={() => { onOpenChange(false); reset(); }}
            className="mt-2 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)] text-sm"
          >
            Fechar
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sn-title" className="text-sm font-medium text-ink dark:text-white">
              Título <span className="text-crimson">*</span>
            </Label>
            <Input
              id="sn-title"
              placeholder="ex: Convite para o culto"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting}
              className="rounded-[8px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sn-msg" className="text-sm font-medium text-ink dark:text-white">
              Mensagem <span className="text-crimson">*</span>
            </Label>
            <textarea
              id="sn-msg"
              rows={3}
              placeholder="Texto da notificação…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-2 text-sm text-ink placeholder:text-stone focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white resize-none"
            />
          </div>

          {segments.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-ink dark:text-white">
                Segmentos{" "}
                <span className="text-xs font-normal text-stone">
                  (vazio = todos)
                </span>
              </Label>
              <div className="max-h-[120px] overflow-y-auto rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] p-2 space-y-1">
                {segments.map((seg) => (
                  <label
                    key={seg.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-[var(--surface-subtle)]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSegmentIds.includes(seg.id)}
                      onChange={() => toggleSegment(seg.id)}
                      disabled={isSubmitting}
                      className="rounded"
                    />
                    <span className="text-sm text-ink dark:text-white">{seg.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

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
              {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : "Enviar"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
