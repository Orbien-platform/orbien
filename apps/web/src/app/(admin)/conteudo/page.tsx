"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Bell, Send, Paperclip } from "lucide-react";
import { Tabs } from "@base-ui/react/tabs";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { CreatePostModal, POST_TYPE_LABELS, type PostType } from "@/components/content/CreatePostModal";
import { PostDetailSheet } from "@/components/content/PostDetailSheet";
import { CreateSegmentModal } from "@/components/content/CreateSegmentModal";
import { SendNotificationModal } from "@/components/content/SendNotificationModal";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type PostStatus = "draft" | "scheduled" | "published";

interface Post {
  id: string;
  title: string;
  type: PostType;
  is_draft: boolean;
  publish_at?: string | null;
  created_at: string;
  media_url?: string | null;
}

interface Segment {
  id: string;
  name: string;
  criteria?: Record<string, unknown>;
  _count?: { posts?: number };
}

interface NotificationDispatch {
  id: string;
  title: string;
  sentAt: string;
  delivered?: number;
  opened?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function tabBtn(active: boolean) {
  return cn(
    "relative px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none",
    active
      ? "text-navy dark:text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-navy"
      : "text-stone hover:text-ink dark:hover:text-white"
  );
}

function PostStatusBadge({ status }: { status: PostStatus }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", STATUS_CLS[status])}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function criteriaLabel(criteria?: Record<string, unknown>): string {
  if (!criteria) return "Todos";
  const parts: string[] = [];
  const g = criteria.group_ids as string[] | undefined;
  const m = criteria.ministry_ids as string[] | undefined;
  const r = criteria.roles as string[] | undefined;
  const minA = criteria.min_age as number | undefined;
  const maxA = criteria.max_age as number | undefined;
  if (g?.length) parts.push(`${g.length} grupo(s)`);
  if (m?.length) parts.push(`${m.length} ministério(s)`);
  if (r?.length) parts.push(r.join(", "));
  if (minA != null || maxA != null) {
    parts.push(`${minA ?? 0}–${maxA ?? "∞"} anos`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Todos";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConteudoPage() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const canEdit = roles.some((r) =>
    ["admin_congregation", "pastor", "tenant_admin"].includes(r)
  );
  const canDelete = roles.some((r) =>
    ["admin_congregation", "tenant_admin"].includes(r)
  );
  const canNotify = canEdit;
  const canManageSegments = canEdit;

  const [activeTab, setActiveTab] = useState("posts");

  // ── Posts ──
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const hasFetchedPosts = useRef(false);

  // ── Segments ──
  const [segments, setSegments] = useState<Segment[]>([]);
  const [segmentsLoading, setSegmentsLoading] = useState(false);
  const hasFetchedSegs = useRef(false);

  // ── Notifications ──
  const [dispatches, setDispatches] = useState<NotificationDispatch[]>([]);

  // ── Sheet / modal state ──
  const [createPostOpen, setCreatePostOpen] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [postSheetOpen, setPostSheetOpen] = useState(false);
  const [createSegOpen, setCreateSegOpen] = useState(false);
  const [sendNotifOpen, setSendNotifOpen] = useState(false);

  // ── Load posts ──
  const loadPosts = useCallback(async (type: string, status: string) => {
    if (hasFetchedPosts.current) return;
    hasFetchedPosts.current = true;
    setPostsLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (type) params.set("type", type);
      if (status === "draft") params.set("is_draft", "true");
      else if (status === "published") params.set("is_draft", "false");
      const { data } = await api.get<{ data: Post[] } | Post[]>(`/content/posts?${params}`);
      setPosts(Array.isArray(data) ? data : data.data ?? []);
    } catch {
      setPosts([]);
    } finally {
      setPostsLoading(false);
    }
  }, []);

  // ── Load segments ──
  const loadSegments = useCallback(async () => {
    if (hasFetchedSegs.current) return;
    hasFetchedSegs.current = true;
    setSegmentsLoading(true);
    try {
      const { data } = await api.get<{ data: Segment[] } | Segment[]>("/content/segments?limit=100");
      setSegments(Array.isArray(data) ? data : data.data ?? []);
    } catch {
      setSegments([]);
    } finally {
      setSegmentsLoading(false);
    }
  }, []);

  useEffect(() => { loadPosts(typeFilter, statusFilter); }, [loadPosts]);

  useEffect(() => {
    if (activeTab === "segmentos") {
      hasFetchedSegs.current = false;
      loadSegments();
    }
  }, [activeTab, loadSegments]);

  useEffect(() => {
    hasFetchedPosts.current = false;
    loadPosts(typeFilter, statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, statusFilter]);

  // Filter scheduled client-side (API may not support it)
  const filteredPosts = statusFilter === "scheduled"
    ? posts.filter((p) => deriveStatus(p) === "scheduled")
    : posts;

  // ── Posts table columns ──
  const postColumns: Column<Post>[] = [
    {
      key: "title",
      header: "Título",
      render: (row) => (
        <span className="flex items-center gap-1.5">
          <span className="font-medium text-ink dark:text-white line-clamp-1">{row.title}</span>
          {row.media_url && (
            <Paperclip size={12} strokeWidth={1.5} className="flex-shrink-0 text-stone" aria-label="Possui arquivo anexado" />
          )}
        </span>
      ),
    },
    {
      key: "type",
      header: "Tipo",
      width: "130px",
      render: (row) => (
        <span className="text-xs text-stone">{POST_TYPE_LABELS[row.type] ?? row.type}</span>
      ),
    },
    {
      key: "date",
      header: "Data",
      width: "110px",
      render: (row) => {
        const d = row.publish_at ?? row.created_at;
        return <span className="text-stone text-xs">{fmtDate(d)}</span>;
      },
    },
    {
      key: "status",
      header: "Status",
      width: "110px",
      render: (row) => <PostStatusBadge status={deriveStatus(row)} />,
    },
  ];

  // ── Segments table columns ──
  const segColumns: Column<Segment>[] = [
    {
      key: "name",
      header: "Nome",
      render: (row) => (
        <span className="font-medium text-ink dark:text-white">{row.name}</span>
      ),
    },
    {
      key: "criteria",
      header: "Critérios",
      render: (row) => (
        <span className="text-xs text-stone">{criteriaLabel(row.criteria)}</span>
      ),
    },
    {
      key: "posts",
      header: "Posts",
      width: "80px",
      render: (row) => (
        <span className="text-stone">{row._count?.posts ?? "—"}</span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-medium text-ink dark:text-white">Conteúdo</h1>
      </div>

      <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List className="flex border-b border-[var(--border-default)]">
          <Tabs.Tab value="posts" className={tabBtn(activeTab === "posts")}>Posts</Tabs.Tab>
          <Tabs.Tab value="segmentos" className={tabBtn(activeTab === "segmentos")}>Segmentos</Tabs.Tab>
          <Tabs.Tab value="notificacoes" className={tabBtn(activeTab === "notificacoes")}>Notificações</Tabs.Tab>
        </Tabs.List>

        {/* ── Tab: Posts ── */}
        <Tabs.Panel value="posts" className="pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex flex-wrap gap-2">
              {/* Type filter */}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-8 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none dark:text-white"
              >
                <option value="">Todos os tipos</option>
                {(Object.entries(POST_TYPE_LABELS) as [PostType, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>

              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none dark:text-white"
              >
                <option value="">Todos os status</option>
                <option value="draft">Rascunhos</option>
                <option value="published">Publicados</option>
                <option value="scheduled">Agendados</option>
              </select>
            </div>

            {canEdit && (
              <Button
                onClick={() => setCreatePostOpen(true)}
                className="flex items-center gap-1.5 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)] text-sm"
              >
                <Plus size={15} strokeWidth={1.5} />
                Novo post
              </Button>
            )}
          </div>

          <DataTable
            columns={postColumns}
            rows={filteredPosts}
            getRowKey={(r) => r.id}
            isLoading={postsLoading}
            onRowClick={(row) => { setSelectedPostId(row.id); setPostSheetOpen(true); }}
            emptyState={<p className="py-8 text-center text-sm text-stone">Nenhum post encontrado.</p>}
          />
        </Tabs.Panel>

        {/* ── Tab: Segmentos ── */}
        <Tabs.Panel value="segmentos" className="pt-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <p className="text-sm text-stone">
              {segments.length > 0
                ? `${segments.length} segmento${segments.length !== 1 ? "s" : ""}`
                : "Nenhum segmento"}
            </p>
            {canManageSegments && (
              <Button
                onClick={() => setCreateSegOpen(true)}
                className="flex items-center gap-1.5 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)] text-sm"
              >
                <Plus size={15} strokeWidth={1.5} />
                Novo segmento
              </Button>
            )}
          </div>

          <DataTable
            columns={segColumns}
            rows={segments}
            getRowKey={(r) => r.id}
            isLoading={segmentsLoading}
            emptyState={
              <div className="flex flex-col items-center gap-2 py-10">
                <p className="text-sm text-stone">Nenhum segmento cadastrado.</p>
                {canManageSegments && (
                  <Button onClick={() => setCreateSegOpen(true)} variant="outline" className="rounded-[8px] text-sm mt-1">
                    Criar primeiro segmento
                  </Button>
                )}
              </div>
            }
          />
        </Tabs.Panel>

        {/* ── Tab: Notificações ── */}
        <Tabs.Panel value="notificacoes" className="pt-5">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <p className="text-sm font-medium text-ink dark:text-white">Notificações push</p>
              <p className="text-xs text-stone">Envie notificações manuais para os membros.</p>
            </div>
            {canNotify && (
              <Button
                onClick={() => setSendNotifOpen(true)}
                className="flex items-center gap-1.5 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)] text-sm"
              >
                <Send size={15} strokeWidth={1.5} />
                Enviar notificação
              </Button>
            )}
          </div>

          {/* Recent dispatches */}
          {dispatches.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] py-10 text-center">
              <Bell size={28} strokeWidth={1} className="text-stone" />
              <p className="text-sm text-stone">
                Nenhuma notificação enviada nesta sessão.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {dispatches.map((d) => {
                const openRate = d.delivered && d.opened
                  ? Math.round((d.opened / d.delivered) * 100)
                  : null;
                return (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-4 rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] px-4 py-3"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-ink dark:text-white">{d.title}</span>
                      <span className="text-xs text-stone">{fmtDate(d.sentAt)}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-stone">
                      {d.delivered != null && (
                        <span>{d.delivered} entregue(s)</span>
                      )}
                      {d.opened != null && (
                        <span>{d.opened} aberto(s)</span>
                      )}
                      {openRate != null && (
                        <span className="font-medium text-teal">{openRate}% abertura</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Tabs.Panel>
      </Tabs.Root>

      {/* ── Modals / Sheets ── */}
      <CreatePostModal
        open={createPostOpen}
        onOpenChange={setCreatePostOpen}
        onCreated={() => {
          hasFetchedPosts.current = false;
          loadPosts(typeFilter, statusFilter);
        }}
      />

      <PostDetailSheet
        open={postSheetOpen}
        onOpenChange={setPostSheetOpen}
        postId={selectedPostId}
        canEdit={canEdit}
        canDelete={canDelete}
        onUpdated={() => {
          hasFetchedPosts.current = false;
          loadPosts(typeFilter, statusFilter);
        }}
      />

      <CreateSegmentModal
        open={createSegOpen}
        onOpenChange={setCreateSegOpen}
        onCreated={() => {
          hasFetchedSegs.current = false;
          loadSegments();
        }}
      />

      <SendNotificationModal
        open={sendNotifOpen}
        onOpenChange={setSendNotifOpen}
        onSent={(result) => {
          setDispatches((prev) => [
            {
              id: Date.now().toString(),
              title: "Notificação manual",
              sentAt: new Date().toISOString(),
              delivered: result.delivered,
            },
            ...prev,
          ]);
        }}
      />
    </div>
  );
}
