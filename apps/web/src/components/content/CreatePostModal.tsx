"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MediaUploadField } from "@/components/content/MediaUploadField";
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
    setError(""); setSuccess(false); hasFetched.current = false;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Título é obrigatório."); return; }
    if (publishMode === "schedule" && !publishAt) {
      setError("Defina a data/hora de publicação."); return;
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

          {/* Corpo */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cp-body" className="text-sm font-medium text-ink dark:text-white">
              Corpo <span className="text-xs font-normal text-stone">(suporta Markdown)</span>
            </Label>
            <textarea
              id="cp-body"
              rows={5}
              placeholder="Conteúdo do post…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-2 text-sm text-ink placeholder:text-stone focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white resize-none font-mono"
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
