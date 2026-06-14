"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Pencil, Trash2, Clock, ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { POST_TYPE_LABELS, type PostType } from "@/components/content/CreatePostModal";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Segment { id: string; name: string; }

interface Post {
  id: string;
  title: string;
  body?: string;
  type: PostType;
  is_draft: boolean;
  publish_at?: string | null;
  created_at: string;
  media_url?: string | null;
  segments?: Segment[];
}

type PostStatus = "draft" | "scheduled" | "published";

function deriveStatus(post: Post): PostStatus {
  if (post.is_draft) return "draft";
  if (post.publish_at && new Date(post.publish_at) > new Date()) return "scheduled";
  return "published";
}

const STATUS_LABELS: Record<PostStatus, string> = {
  draft: "Rascunho",
  scheduled: "Agendado",
  published: "Publicado",
};

const STATUS_CLS: Record<PostStatus, string> = {
  draft: "bg-[var(--surface-subtle)] text-stone",
  scheduled: "bg-navy-dim text-navy",
  published: "bg-teal-dim text-teal",
};

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

interface PostDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId: string | null;
  canEdit: boolean;
  canDelete: boolean;
  onUpdated: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PostDetailSheet({
  open,
  onOpenChange,
  postId,
  canEdit,
  canDelete,
  onUpdated,
}: PostDetailSheetProps) {
  const [post, setPost] = useState<Post | null>(null);
  const [allSegments, setAllSegments] = useState<Segment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit form state
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editMediaUrl, setEditMediaUrl] = useState("");
  const [editSegmentIds, setEditSegmentIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const hasFetched = useRef(false);

  const loadPost = useCallback(async (id: string) => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    setIsLoading(true);
    try {
      const [pRes, sRes] = await Promise.allSettled([
        api.get<Post>(`/content/posts/${id}`),
        api.get<{ data: Segment[] } | Segment[]>("/content/segments?limit=100"),
      ]);
      if (pRes.status === "fulfilled") {
        const p = pRes.value.data;
        setPost(p);
        setEditTitle(p.title);
        setEditBody(p.body ?? "");
        setEditMediaUrl(p.media_url ?? "");
        setEditSegmentIds(p.segments?.map((s) => s.id) ?? []);
      }
      if (sRes.status === "fulfilled") {
        const d = sRes.value.data;
        setAllSegments(Array.isArray(d) ? d : d.data ?? []);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && postId) {
      hasFetched.current = false;
      setPost(null);
      setEditing(false);
      setConfirmDelete(false);
      loadPost(postId);
    }
  }, [open, postId, loadPost]);

  async function handlePublish() {
    if (!postId) return;
    setIsPublishing(true);
    try {
      await api.post(`/content/posts/${postId}/publish`);
      hasFetched.current = false;
      await loadPost(postId);
      onUpdated();
    } catch {
      // ignore
    } finally {
      setIsPublishing(false);
    }
  }

  async function handleDelete() {
    if (!postId) return;
    setIsDeleting(true);
    try {
      await api.delete(`/content/posts/${postId}`);
      onUpdated();
      onOpenChange(false);
    } catch {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function handleSave() {
    if (!postId) return;
    setSaveError("");
    if (!editTitle.trim()) { setSaveError("Título é obrigatório."); return; }
    setIsSaving(true);
    try {
      await api.patch(`/content/posts/${postId}`, {
        title: editTitle.trim(),
        body: editBody.trim() || undefined,
        media_url: editMediaUrl.trim() || undefined,
        segment_ids: editSegmentIds.length > 0 ? editSegmentIds : undefined,
      });
      hasFetched.current = false;
      await loadPost(postId);
      setEditing(false);
      onUpdated();
    } catch {
      setSaveError("Erro ao salvar alterações.");
    } finally {
      setIsSaving(false);
    }
  }

  function toggleEditSegment(id: string) {
    setEditSegmentIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  const status = post ? deriveStatus(post) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[500px] overflow-y-auto p-0">
        {isLoading || !post ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 size={24} className="animate-spin text-stone" />
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Header */}
            <SheetHeader className="px-4 pt-6 pb-4 border-b border-[var(--border-default)]">
              <div className="flex items-start justify-between gap-3 pr-8">
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <SheetTitle className="text-base font-medium text-ink dark:text-white leading-tight">
                    {post.title}
                  </SheetTitle>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="text-xs text-stone">
                      {POST_TYPE_LABELS[post.type] ?? post.type}
                    </span>
                    {status && (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          STATUS_CLS[status]
                        )}
                      >
                        {STATUS_LABELS[status]}
                      </span>
                    )}
                  </div>
                  {status === "scheduled" && post.publish_at && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-stone">
                      <Clock size={11} strokeWidth={1.5} />
                      Agendado para {fmtDateTime(post.publish_at)}
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                {canEdit && !editing && (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="flex items-center gap-1 rounded-[6px] px-2 py-1 text-xs text-stone hover:bg-[var(--surface-subtle)] hover:text-ink transition-colors"
                  >
                    <Pencil size={12} strokeWidth={1.5} />
                    Editar
                  </button>
                )}
              </div>

              {/* Publish / Delete actions */}
              {!editing && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {canEdit && status === "draft" && (
                    <Button
                      type="button"
                      onClick={handlePublish}
                      disabled={isPublishing}
                      className="flex items-center gap-1.5 rounded-[8px] bg-teal text-white hover:bg-teal/90 text-sm"
                    >
                      {isPublishing && <Loader2 size={13} className="animate-spin" />}
                      Publicar
                    </Button>
                  )}
                  {canDelete && !confirmDelete && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setConfirmDelete(true)}
                      className="flex items-center gap-1.5 rounded-[8px] text-crimson border-crimson/30 hover:bg-crimson-dim text-sm"
                    >
                      <Trash2 size={13} strokeWidth={1.5} />
                      Excluir
                    </Button>
                  )}
                  {confirmDelete && (
                    <div className="flex items-center gap-2 rounded-[8px] bg-crimson-dim px-3 py-2">
                      <span className="text-xs text-crimson">Confirmar exclusão?</span>
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="text-xs font-medium text-crimson hover:underline"
                      >
                        {isDeleting ? "…" : "Sim"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="text-xs text-stone hover:underline"
                      >
                        Não
                      </button>
                    </div>
                  )}
                </div>
              )}
            </SheetHeader>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4">
              {editing ? (
                /* ── Edit form ── */
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-sm font-medium text-ink dark:text-white">Título *</Label>
                    <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} disabled={isSaving} className="rounded-[8px]" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-sm font-medium text-ink dark:text-white">Corpo</Label>
                    <textarea
                      rows={6}
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      disabled={isSaving}
                      className="w-full rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-2 text-sm text-ink focus:outline-none dark:text-white resize-none font-mono"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-sm font-medium text-ink dark:text-white">URL de mídia</Label>
                    <Input type="url" value={editMediaUrl} onChange={(e) => setEditMediaUrl(e.target.value)} disabled={isSaving} className="rounded-[8px]" />
                  </div>
                  {allSegments.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-sm font-medium text-ink dark:text-white">Segmentos</Label>
                      <div className="max-h-[100px] overflow-y-auto rounded-[8px] border border-[var(--border-default)] p-2 space-y-1">
                        {allSegments.map((s) => (
                          <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-[var(--surface-subtle)]">
                            <input type="checkbox" checked={editSegmentIds.includes(s.id)} onChange={() => toggleEditSegment(s.id)} disabled={isSaving} className="rounded" />
                            <span className="text-sm text-ink dark:text-white">{s.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  {saveError && <p className="text-sm text-crimson">{saveError}</p>}
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 rounded-[8px]" onClick={() => setEditing(false)} disabled={isSaving}>Cancelar</Button>
                    <Button onClick={handleSave} disabled={isSaving} className="flex-1 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)]">
                      {isSaving ? <Loader2 size={15} className="animate-spin" /> : "Salvar"}
                    </Button>
                  </div>
                </div>
              ) : (
                /* ── View mode ── */
                <div className="flex flex-col gap-4">
                  {/* Body text */}
                  {post.body ? (
                    <div className="text-sm text-ink dark:text-white leading-relaxed whitespace-pre-wrap">
                      {post.body}
                    </div>
                  ) : (
                    <p className="text-sm text-stone italic">Sem conteúdo.</p>
                  )}

                  {/* Media URL */}
                  {post.media_url && (
                    <a
                      href={post.media_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-sm text-navy hover:underline"
                    >
                      <ExternalLink size={13} strokeWidth={1.5} />
                      Mídia / link externo
                    </a>
                  )}

                  {/* Segments */}
                  {(post.segments?.length ?? 0) > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-xs font-medium text-stone uppercase tracking-wide">Segmentos</p>
                      <div className="flex flex-wrap gap-1.5">
                        {post.segments!.map((s) => (
                          <span
                            key={s.id}
                            className="rounded-full bg-navy-dim px-2 py-0.5 text-xs text-navy"
                          >
                            {s.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Meta */}
                  <p className="text-xs text-stone border-t border-[var(--border-default)] pt-3">
                    Criado em {fmtDateTime(post.created_at)}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
