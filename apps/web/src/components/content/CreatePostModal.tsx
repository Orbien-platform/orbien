"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { Loader2, CheckCircle2, UploadCloud, FileText, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

// ─── Upload helpers ────────────────────────────────────────────────────────────

const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "audio/mpeg",
  "video/mp4",
  "image/jpeg",
  "image/png",
  "image/webp",
];
const ACCEPTED_EXTENSIONS = ".pdf,.mp3,.mp4,.jpg,.jpeg,.png,.webp";
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) return "Arquivo muito grande. Máximo: 50MB";
  if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
    return "Formato não suportado. Use PDF, MP3, MP4 ou imagem.";
  }
  return null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1).replace(".", ",")} KB`;
  return `${(kb / 1024).toFixed(1).replace(".", ",")} MB`;
}

function uploadPostMedia(
  postId: string,
  file: File,
  onProgress: (percent: number) => void
): Promise<{ media_url: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${api.defaults.baseURL}/content/posts/${postId}/upload`);
    const token = getAccessToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("invalid_response"));
        }
      } else {
        reject(new Error(`upload_failed_${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("network_error"));
    const formData = new FormData();
    formData.append("file", file);
    xhr.send(formData);
  });
}

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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<string[]>([]);
  const [publishMode, setPublishMode] = useState<PublishMode>("now");
  const [publishAt, setPublishAt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const hasFetched = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3000);
  }

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
    setSelectedFile(null); setIsDragging(false); setIsUploading(false); setUploadProgress(0);
    setSelectedSegmentIds([]); setPublishMode("now"); setPublishAt("");
    setError(""); setSuccess(false); hasFetched.current = false;
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileSelect(file: File) {
    const err = validateFile(file);
    if (err) { showToast(err); return; }
    setSelectedFile(file);
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
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

    if (mediaMode === "upload" && selectedFile) {
      try {
        const { data: created } = await api.post<{ id: string }>("/content/posts", {
          type,
          title: title.trim(),
          body: body.trim() || undefined,
          segment_ids: selectedSegmentIds.length > 0 ? selectedSegmentIds : undefined,
          is_draft: isDraft,
          publish_at: scheduleDate ?? null,
        });

        setIsUploading(true);
        setUploadProgress(0);
        try {
          await uploadPostMedia(created.id, selectedFile, setUploadProgress);
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
        setIsUploading(false);
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
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-ink dark:text-white">
              Mídia <span className="text-xs font-normal text-stone">(opcional)</span>
            </Label>

            <div className="flex gap-1 rounded-[8px] bg-[var(--surface-subtle)] p-1">
              <button
                type="button"
                onClick={() => setMediaMode("link")}
                disabled={isSubmitting}
                className={cn(
                  "flex-1 rounded-[6px] px-2 py-1.5 text-xs font-medium transition-colors",
                  mediaMode === "link"
                    ? "bg-[var(--surface-base)] text-ink shadow-sm dark:text-white"
                    : "text-stone hover:text-ink dark:hover:text-white"
                )}
              >
                Link externo
              </button>
              <button
                type="button"
                onClick={() => setMediaMode("upload")}
                disabled={isSubmitting}
                className={cn(
                  "flex-1 rounded-[6px] px-2 py-1.5 text-xs font-medium transition-colors",
                  mediaMode === "upload"
                    ? "bg-[var(--surface-base)] text-ink shadow-sm dark:text-white"
                    : "text-stone hover:text-ink dark:hover:text-white"
                )}
              >
                Upload de arquivo
              </button>
            </div>

            {mediaMode === "link" ? (
              <Input
                id="cp-media"
                type="url"
                placeholder="https://…"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                disabled={isSubmitting}
                className="rounded-[8px]"
              />
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_EXTENSIONS}
                  onChange={handleFileInputChange}
                  disabled={isSubmitting}
                  className="hidden"
                />

                {selectedFile ? (
                  <div className="flex items-center justify-between gap-2 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-subtle)] px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText size={16} strokeWidth={1.5} className="flex-shrink-0 text-stone" />
                      <span className="truncate text-sm text-ink dark:text-white">
                        {selectedFile.name}{" "}
                        <span className="text-stone">· {formatFileSize(selectedFile.size)}</span>
                      </span>
                    </div>
                    {!isSubmitting && (
                      <button
                        type="button"
                        onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                        className="flex-shrink-0 text-stone hover:text-crimson"
                        aria-label="Remover arquivo"
                      >
                        <X size={14} strokeWidth={1.5} />
                      </button>
                    )}
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => { e.preventDefault(); if (!isSubmitting) setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={isSubmitting ? undefined : handleDrop}
                    onClick={() => { if (!isSubmitting) fileInputRef.current?.click(); }}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 rounded-[8px] border-2 border-dashed px-4 py-6 text-center transition-colors",
                      isSubmitting ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                      isDragging
                        ? "border-navy bg-navy-dim"
                        : "border-[var(--border-default)] hover:border-navy/40"
                    )}
                  >
                    <UploadCloud size={20} strokeWidth={1.5} className="text-stone" />
                    <p className="text-sm text-stone">
                      Arraste um arquivo aqui ou <span className="font-medium text-navy">selecione</span>
                    </p>
                    <p className="text-xs text-stone">PDF, MP3, MP4, JPG, PNG ou WEBP · máx. 50MB</p>
                  </div>
                )}

                {isUploading && (
                  <div className="flex flex-col gap-1">
                    <Progress value={uploadProgress} />
                    <p className="text-xs text-stone">Enviando arquivo… {uploadProgress}%</p>
                  </div>
                )}
              </div>
            )}
          </div>

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
