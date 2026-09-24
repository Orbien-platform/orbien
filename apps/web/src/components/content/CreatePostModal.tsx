"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MediaUploadField } from "@/components/content/MediaUploadField";
import { RichTextEditor } from "@/components/content/RichTextEditor";
import { useFileUpload } from "@/hooks/useFileUpload";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

// ─── Constants ────────────────────────────────────────────────────────────────

export type PostType =
  | "post" | "sermon_video" | "audio" | "devotional"
  | "study" | "event" | "notice" | "prayer";

export const POST_TYPE_LABELS: Record<PostType, string> = {
  post: "Post",
  sermon_video: "Vídeo Sermão",
  audio: "Áudio",
  devotional: "Devocional",
  study: "Estudo",
  event: "Evento",
  notice: "Aviso",
  prayer: "Oração",
};

type PublishMode = "draft" | "now" | "schedule";

interface Segment { id: string; name: string; }

interface CreatePostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CreatePostModal({
  open,
  onOpenChange,
  onCreated,
}: CreatePostModalProps) {
  const [type, setType] = useState<PostType>("post");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mediaMode, setMediaMode] = useState<"link" | "upload">("link");
  const [mediaUrl, setMediaUrl] = useState("");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<string[]>([]);
  const [publishMode, setPublishMode] = useState<PublishMode>("now");
  const [publishAt, setPublishAt] = useState("");
  // Evento (PROD-16). A API recusa esses campos em post que não é evento, e
  // por isso `eventPayload()` só os manda quando `type === "event"`.
  const [eventStartsAt, setEventStartsAt] = useState("");
  const [eventEndsAt, setEventEndsAt] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [registrationLimit, setRegistrationLimit] = useState("");
  const [registrationDeadline, setRegistrationDeadline] = useState("");
  // Inscrição paga (PROD-24, Premium). Vazio é evento gratuito — a API
  // recusa preço zero (não é "gratuito", é erro de digitação).
  const [registrationPrice, setRegistrationPrice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const hasFetched = useRef(false);

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3000);
  }

  const fileUpload = useFileUpload(showToast);

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
    setType("post"); setTitle(""); setBody(""); setMediaMode("link"); setMediaUrl("");
    fileUpload.reset();
    setSelectedSegmentIds([]); setPublishMode("now"); setPublishAt("");
    setEventStartsAt(""); setEventEndsAt(""); setEventLocation("");
    setRegistrationEnabled(false); setRegistrationLimit(""); setRegistrationDeadline("");
    setRegistrationPrice("");
    setError(""); setSuccess(false); hasFetched.current = false;
  }

  const isEvent = type === "event";

  /**
   * Os campos de evento, ou nada. Mandar `registration_enabled: false` num
   * post comum não é inofensivo: a API recusa qualquer campo de evento fora
   * de `type: "event"` (ver `assertEventFields`), inclusive o falso.
   */
  function eventPayload(): Record<string, unknown> {
    if (!isEvent) return {};
    return {
      event_starts_at: eventStartsAt ? new Date(eventStartsAt).toISOString() : null,
      event_ends_at: eventEndsAt ? new Date(eventEndsAt).toISOString() : null,
      event_location: eventLocation.trim() || null,
      registration_enabled: registrationEnabled,
      registration_limit: registrationEnabled && registrationLimit
        ? Number(registrationLimit)
        : null,
      registration_deadline:
        registrationEnabled && registrationDeadline
          ? new Date(registrationDeadline).toISOString()
          : null,
      ...(registrationEnabled && registrationPrice
        ? { registration_price: Number(registrationPrice) }
        : {}),
    };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Título é obrigatório."); return; }
    if (publishMode === "schedule" && !publishAt) {
      setError("Defina a data/hora de publicação."); return;
    }
    if (isEvent && registrationEnabled && registrationLimit && Number(registrationLimit) < 1) {
      setError("O limite de vagas precisa ser ao menos 1."); return;
    }
    if (isEvent && registrationEnabled && registrationPrice && Number(registrationPrice) <= 0) {
      setError("O preço da inscrição precisa ser maior que zero."); return;
    }
    setError("");
    setIsSubmitting(true);

    const isDraft = publishMode === "draft";
    const scheduleDate =
      publishMode === "schedule" ? new Date(publishAt).toISOString() : undefined;

    if (mediaMode === "upload" && fileUpload.selectedFile) {
      try {
        const { data: created } = await api.post<{ id: string }>("/content/posts", {
          type,
          title: title.trim(),
          body: body.trim() || undefined,
          segment_ids: selectedSegmentIds.length > 0 ? selectedSegmentIds : undefined,
          is_draft: isDraft,
          publish_at: scheduleDate ?? null,
          ...eventPayload(),
        });

        try {
          await fileUpload.upload(created.id);
        } catch {
          await api.patch(`/content/posts/${created.id}`, { media_url: null }).catch(() => {});
          setError("Erro ao enviar o arquivo. O post foi salvo sem mídia.");
          return;
        }

        showToast("Post criado com sucesso");
        onCreated();
        onOpenChange(false);
        reset();
      } catch {
        setError("Erro ao criar post. Tente novamente.");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    try {
      await api.post("/content/posts", {
        type,
        title: title.trim(),
        body: body.trim() || undefined,
        media_url: mediaUrl.trim() || undefined,
        segment_ids: selectedSegmentIds.length > 0 ? selectedSegmentIds : undefined,
        is_draft: isDraft,
        publish_at: scheduleDate ?? null,
        ...eventPayload(),
      });
      setSuccess(true);
      setTimeout(() => { onCreated(); onOpenChange(false); reset(); }, 1200);
    } catch {
      setError("Erro ao criar post. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const modeBtn = (m: PublishMode, label: string) => (
    <button
      key={m}
      type="button"
      onClick={() => setPublishMode(m)}
      disabled={isSubmitting}
      className={cn(
        "flex-1 rounded-[6px] py-1.5 text-sm font-medium transition-colors",
        publishMode === m
          ? "bg-navy text-white"
          : "text-stone hover:text-ink dark:hover:text-white"
      )}
    >
      {label}
    </button>
  );

  return (
    <>
    <Modal
      open={open}
      onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}
      title="Novo post"
      className="max-w-lg"
    >
      {success ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 size={40} className="text-teal" strokeWidth={1.5} />
          <p className="text-sm font-medium text-ink dark:text-white">Post criado!</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Tipo */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cp-type" className="text-sm font-medium text-ink dark:text-white">
              Tipo <span className="text-crimson">*</span>
            </Label>
            <select
              id="cp-type"
              value={type}
              onChange={(e) => setType(e.target.value as PostType)}
              disabled={isSubmitting}
              className="h-9 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
            >
              {(Object.entries(POST_TYPE_LABELS) as [PostType, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          {/* Título */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cp-title" className="text-sm font-medium text-ink dark:text-white">
              Título <span className="text-crimson">*</span>
            </Label>
            <Input
              id="cp-title"
              placeholder="Título do post"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting}
              className="rounded-[8px]"
            />
          </div>

          {/* Evento (PROD-16) — só aparece no tipo que os usa */}
          {isEvent && (
            <div className="flex flex-col gap-3 rounded-[8px] bg-[var(--surface-subtle)] p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cp-event-start" className="text-sm font-medium text-ink dark:text-white">
                    Começa em
                  </Label>
                  <Input
                    id="cp-event-start"
                    type="datetime-local"
                    value={eventStartsAt}
                    onChange={(e) => setEventStartsAt(e.target.value)}
                    disabled={isSubmitting}
                    className="rounded-[8px]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cp-event-end" className="text-sm font-medium text-ink dark:text-white">
                    Termina em
                  </Label>
                  <Input
                    id="cp-event-end"
                    type="datetime-local"
                    value={eventEndsAt}
                    onChange={(e) => setEventEndsAt(e.target.value)}
                    disabled={isSubmitting}
                    className="rounded-[8px]"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cp-event-location" className="text-sm font-medium text-ink dark:text-white">
                  Local
                </Label>
                <Input
                  id="cp-event-location"
                  placeholder="Onde vai acontecer"
                  value={eventLocation}
                  onChange={(e) => setEventLocation(e.target.value)}
                  disabled={isSubmitting}
                  className="rounded-[8px]"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-ink dark:text-white">
                <input
                  type="checkbox"
                  checked={registrationEnabled}
                  onChange={(e) => setRegistrationEnabled(e.target.checked)}
                  disabled={isSubmitting}
                  className="size-4 rounded border-[var(--border-default)] accent-[var(--color-navy)]"
                />
                Abrir inscrições
              </label>

              {registrationEnabled && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="cp-event-limit" className="text-sm font-medium text-ink dark:text-white">
                      Limite de vagas{" "}
                      <span className="text-xs font-normal text-stone">(vazio = sem limite)</span>
                    </Label>
                    <Input
                      id="cp-event-limit"
                      type="number"
                      min={1}
                      value={registrationLimit}
                      onChange={(e) => setRegistrationLimit(e.target.value)}
                      disabled={isSubmitting}
                      className="rounded-[8px]"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="cp-event-deadline" className="text-sm font-medium text-ink dark:text-white">
                      Inscrições até
                    </Label>
                    <Input
                      id="cp-event-deadline"
                      type="datetime-local"
                      value={registrationDeadline}
                      onChange={(e) => setRegistrationDeadline(e.target.value)}
                      disabled={isSubmitting}
                      className="rounded-[8px]"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="cp-event-price" className="text-sm font-medium text-ink dark:text-white">
                      Preço da inscrição{" "}
                      <span className="text-xs font-normal text-stone">
                        (vazio = gratuito · Premium)
                      </span>
                    </Label>
                    <Input
                      id="cp-event-price"
                      type="number"
                      min={0.01}
                      step={0.01}
                      placeholder="R$"
                      value={registrationPrice}
                      onChange={(e) => setRegistrationPrice(e.target.value)}
                      disabled={isSubmitting}
                      className="rounded-[8px]"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Corpo */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cp-body" className="text-sm font-medium text-ink dark:text-white">
              Corpo
            </Label>
            <RichTextEditor
              id="cp-body"
              placeholder="Conteúdo do post…"
              value={body}
              onChange={setBody}
              disabled={isSubmitting}
            />
          </div>

          {/* Mídia */}
          <MediaUploadField
            mode={mediaMode}
            onModeChange={setMediaMode}
            linkValue={mediaUrl}
            onLinkChange={setMediaUrl}
            upload={fileUpload}
            disabled={isSubmitting}
          />

          {/* Segmentos */}
          {segments.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-ink dark:text-white">
                Segmentos-alvo{" "}
                <span className="text-xs font-normal text-stone">(vazio = todos)</span>
              </Label>
              <div className="max-h-[100px] overflow-y-auto rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] p-2 space-y-1">
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

          {/* Publicação mode */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-ink dark:text-white">Publicação</Label>
            <div className="flex gap-1 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-subtle)] p-1">
              {modeBtn("draft", "Rascunho")}
              {modeBtn("now", "Agora")}
              {modeBtn("schedule", "Agendar")}
            </div>

            {publishMode === "schedule" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cp-at" className="text-sm font-medium text-ink dark:text-white">
                  Data e hora <span className="text-crimson">*</span>
                </Label>
                <Input
                  id="cp-at"
                  type="datetime-local"
                  value={publishAt}
                  onChange={(e) => setPublishAt(e.target.value)}
                  disabled={isSubmitting}
                  className="rounded-[8px]"
                />
              </div>
            )}
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
              {isSubmitting ? (
                <Loader2 size={15} className="animate-spin" />
              ) : publishMode === "draft" ? (
                "Salvar rascunho"
              ) : publishMode === "schedule" ? (
                "Agendar"
              ) : (
                "Publicar"
              )}
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
