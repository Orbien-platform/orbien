"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  Loader2, X, Plus, ArrowUp, ArrowDown, Trash2, ExternalLink,
  Music, BookOpen, Heart, Megaphone, Wallet, Clock, FileDown,
} from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddItemModal, ITEM_TYPE_LABELS, type ItemType } from "@/components/celebrations/AddItemModal";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SetlistSong {
  id: string;
  title: string;
  key?: string;
  bpm?: number;
  link?: string;
  position: number;
}

interface Setlist {
  id: string;
  songs: SetlistSong[];
}

interface ServiceOrderItem {
  id: string;
  name: string;
  type: ItemType;
  duration_minutes?: number;
  start_time?: string;
  responsible?: { id: string; full_name: string } | null;
  notes?: string;
  position: number;
  setlist?: Setlist | null;
}

interface ServiceOrder {
  id: string;
  status?: string;
  items: ServiceOrderItem[];
}

interface CelebrationInstance {
  id: string;
  date: string;
  celebration: { id: string; name: string; time?: string };
  status?: string;
}

interface ServiceOrderViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: string | null;
  canEdit: boolean;
  canAddSongs: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
}

function ItemIcon({ type }: { type: ItemType }) {
  const cls = "flex-shrink-0";
  switch (type) {
    case "worship": return <Music size={14} strokeWidth={1.5} className={cn(cls, "text-teal")} />;
    case "sermon": return <BookOpen size={14} strokeWidth={1.5} className={cn(cls, "text-navy")} />;
    case "prayer": return <Heart size={14} strokeWidth={1.5} className={cn(cls, "text-[#DB2777]")} />;
    case "announcements": return <Megaphone size={14} strokeWidth={1.5} className={cn(cls, "text-[#D97706]")} />;
    case "offering": return <Wallet size={14} strokeWidth={1.5} className={cn(cls, "text-[#16A34A]")} />;
    default: return <Clock size={14} strokeWidth={1.5} className={cn(cls, "text-stone")} />;
  }
}

// ─── Add Song inline form ──────────────────────────────────────────────────────

interface AddSongFormProps {
  setlistId: string;
  nextPosition: number;
  onAdded: () => void;
  onCancel: () => void;
}

function AddSongForm({ setlistId, nextPosition, onAdded, onCancel }: AddSongFormProps) {
  const [title, setTitle] = useState("");
  const [key, setKey] = useState("");
  const [bpm, setBpm] = useState("");
  const [link, setLink] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Título é obrigatório."); return; }
    setError("");
    setIsSubmitting(true);
    try {
      await api.post(`/celebrations/setlists/${setlistId}/songs`, {
        title: title.trim(),
        key: key.trim() || undefined,
        bpm: bpm ? parseInt(bpm, 10) : undefined,
        link: link.trim() || undefined,
        position: nextPosition,
      });
      onAdded();
    } catch {
      setError("Erro ao adicionar música.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-2 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-subtle)] p-3 mt-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-2">
          <Input
            placeholder="Título *"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isSubmitting}
            className="rounded-[6px] text-xs h-8"
          />
        </div>
        <Input
          placeholder="Tom (ex: G)"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          disabled={isSubmitting}
          className="rounded-[6px] text-xs h-8"
        />
        <Input
          type="number"
          placeholder="BPM"
          value={bpm}
          onChange={(e) => setBpm(e.target.value)}
          disabled={isSubmitting}
          className="rounded-[6px] text-xs h-8"
        />
      </div>
      <Input
        placeholder="Link (YouTube, Cifra Club…)"
        value={link}
        onChange={(e) => setLink(e.target.value)}
        disabled={isSubmitting}
        className="rounded-[6px] text-xs h-8"
      />
      {error && <p className="text-xs text-crimson">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1 rounded-[6px] text-xs py-1" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting} className="flex-1 rounded-[6px] bg-navy text-white hover:bg-[var(--color-navy-dark)] text-xs py-1">
          {isSubmitting ? <Loader2 size={12} className="animate-spin" /> : "Adicionar"}
        </Button>
      </div>
    </form>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function ServiceOrderView({
  open,
  onOpenChange,
  instanceId,
  canEdit,
  canAddSongs,
}: ServiceOrderViewProps) {
  const [instance, setInstance] = useState<CelebrationInstance | null>(null);
  const [serviceOrder, setServiceOrder] = useState<ServiceOrder | null>(null);
  const [items, setItems] = useState<ServiceOrderItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [noOC, setNoOC] = useState(false);
  const [isCreatingOC, setIsCreatingOC] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addSongForItemId, setAddSongForItemId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const hasFetched = useRef(false);

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3000);
  }

  const loadData = useCallback(async (id: string) => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    setIsLoading(true);
    setNoOC(false);
    try {
      // Load instance details
      const instRes = await api.get<CelebrationInstance>(`/celebrations/instances/${id}`);
      setInstance(instRes.data);

      // Load service order (may be 404 if none exists yet)
      try {
        const soRes = await api.get<ServiceOrder>(`/celebrations/instances/${id}/service-order`);
        setServiceOrder(soRes.data);
        setItems(
          [...(soRes.data.items ?? [])].sort((a, b) => a.position - b.position)
        );
      } catch (soErr: unknown) {
        const status = (soErr as { response?: { status: number } })?.response?.status;
        if (status === 404) {
          setNoOC(true);
        }
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && instanceId) {
      hasFetched.current = false;
      setInstance(null);
      setServiceOrder(null);
      setItems([]);
      setNoOC(false);
      setAddItemOpen(false);
      setAddSongForItemId(null);
      loadData(instanceId);
    }
  }, [open, instanceId, loadData]);

  async function handleCreateOC() {
    if (!instanceId) return;
    setIsCreatingOC(true);
    try {
      const { data } = await api.post<ServiceOrder>("/celebrations/service-orders", {
        instance_id: instanceId,
      });
      setServiceOrder(data);
      setItems([]);
      setNoOC(false);
    } catch {
      showToast("Erro ao criar Ordem de Celebração.");
    } finally {
      setIsCreatingOC(false);
    }
  }

  async function handleDeleteItem(itemId: string) {
    setDeletingItemId(itemId);
    try {
      await api.delete(`/celebrations/service-orders/items/${itemId}`);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch {
      showToast("Erro ao remover etapa.");
    } finally {
      setDeletingItemId(null);
    }
  }

  async function handleMoveItem(index: number, direction: "up" | "down") {
    const newItems = [...items];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newItems.length) return;

    // Swap positions in local state
    const posA = newItems[index].position;
    const posB = newItems[targetIndex].position;
    newItems[index] = { ...newItems[index], position: posB };
    newItems[targetIndex] = { ...newItems[targetIndex], position: posA };
    newItems.sort((a, b) => a.position - b.position);
    setItems(newItems);

    // Persist both
    setReordering(true);
    try {
      await Promise.all([
        api.patch(`/celebrations/service-orders/items/${items[index].id}`, { position: posB }),
        api.patch(`/celebrations/service-orders/items/${items[targetIndex].id}`, { position: posA }),
      ]);
    } catch {
      // Revert on error
      hasFetched.current = false;
      if (instanceId) loadData(instanceId);
    } finally {
      setReordering(false);
    }
  }

  async function handleDeleteSong(songId: string, itemId: string) {
    try {
      await api.delete(`/celebrations/setlists/songs/${songId}`);
      setItems((prev) =>
        prev.map((item) =>
          item.id !== itemId
            ? item
            : {
                ...item,
                setlist: item.setlist
                  ? { ...item.setlist, songs: item.setlist.songs.filter((s) => s.id !== songId) }
                  : null,
              }
        )
      );
    } catch {
      showToast("Erro ao remover música.");
    }
  }

  // After adding item: reload OC
  async function afterAddItem() {
    if (!instanceId) return;
    hasFetched.current = false;
    await loadData(instanceId);
  }

  // After adding song: reload
  async function afterAddSong() {
    setAddSongForItemId(null);
    if (!instanceId) return;
    hasFetched.current = false;
    await loadData(instanceId);
  }

  // Create setlist for a worship item then open add-song form
  async function handleCreateSetlist(item: ServiceOrderItem) {
    if (item.setlist) {
      setAddSongForItemId(item.id);
      return;
    }
    try {
      const { data } = await api.post<Setlist>("/celebrations/setlists", {
        service_order_item_id: item.id,
      });
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, setlist: data } : i))
      );
      setAddSongForItemId(item.id);
    } catch {
      showToast("Erro ao criar setlist.");
    }
  }

  async function handleExportPDF() {
    if (!instanceId) return;
    setIsExporting(true);
    try {
      const res = await api.post(
        `/celebrations/instances/${instanceId}/export-pdf`,
        {},
        { responseType: "blob" }
      );
      const blob = new Blob([res.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `OC-${instance?.celebration.name ?? "celebracao"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      showToast("Exportação PDF não disponível.");
    } finally {
      setIsExporting(false);
    }
  }

  const isReadOnly = !canEdit;

  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
          <Dialog.Popup className="fixed inset-0 z-50 flex flex-col bg-[var(--surface-base)] transition duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 overflow-hidden">
            {/* ── Top bar ── */}
            <div className="flex items-center gap-4 border-b border-[var(--border-default)] px-4 py-3 sm:px-6">
              <Dialog.Close className="flex h-8 w-8 items-center justify-center rounded-[8px] text-stone transition-colors hover:bg-[var(--surface-subtle)] hover:text-ink">
                <X size={16} strokeWidth={1.5} />
                <span className="sr-only">Fechar</span>
              </Dialog.Close>

              <div className="flex flex-col min-w-0">
                <Dialog.Title className="truncate text-sm font-medium text-ink dark:text-white">
                  {instance?.celebration.name ?? "Ordem de Celebração"}
                </Dialog.Title>
                {instance && (
                  <Dialog.Description className="text-xs text-stone">
                    {fmtDate(instance.date)}
                    {instance.celebration.time ? ` · ${instance.celebration.time}` : ""}
                  </Dialog.Description>
                )}
              </div>

              <div className="ml-auto flex items-center gap-2">
                {canEdit && serviceOrder && (
                  <Button
                    type="button"
                    onClick={() => setAddItemOpen(true)}
                    className="flex items-center gap-1.5 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)] text-sm"
                  >
                    <Plus size={14} strokeWidth={1.5} />
                    <span className="hidden sm:inline">Etapa</span>
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleExportPDF}
                  disabled={isExporting || !serviceOrder}
                  className="flex items-center gap-1.5 rounded-[8px] text-sm"
                >
                  {isExporting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <FileDown size={14} strokeWidth={1.5} />
                  )}
                  <span className="hidden sm:inline">PDF</span>
                </Button>
              </div>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 size={24} className="animate-spin text-stone" />
                </div>
              ) : noOC ? (
                /* No OC yet */
                <div className="flex flex-col items-center gap-4 px-4 py-16 text-center">
                  <p className="text-sm text-stone">
                    Esta instância ainda não tem uma Ordem de Celebração.
                  </p>
                  {canEdit && (
                    <Button
                      type="button"
                      onClick={handleCreateOC}
                      disabled={isCreatingOC}
                      className="rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)]"
                    >
                      {isCreatingOC ? (
                        <Loader2 size={15} className="animate-spin mr-2" />
                      ) : null}
                      Criar Ordem de Celebração
                    </Button>
                  )}
                </div>
              ) : items.length === 0 ? (
                /* OC exists but no items */
                <div className="flex flex-col items-center gap-4 px-4 py-16 text-center">
                  <p className="text-sm text-stone">Nenhuma etapa adicionada.</p>
                  {canEdit && (
                    <Button
                      type="button"
                      onClick={() => setAddItemOpen(true)}
                      className="rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)]"
                    >
                      <Plus size={14} strokeWidth={1.5} className="mr-1.5" />
                      Adicionar primeira etapa
                    </Button>
                  )}
                </div>
              ) : (
                /* Items list */
                <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 flex flex-col gap-3">
                  {items.map((item, idx) => {
                    const isShowingSongForm =
                      addSongForItemId === item.id;
                    const setlist = item.setlist;

                    return (
                      <div
                        key={item.id}
                        className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] overflow-hidden"
                      >
                        {/* Item header */}
                        <div className="flex items-start gap-3 px-4 py-3">
                          {/* Reorder buttons */}
                          {canEdit && !isReadOnly && (
                            <div className="flex flex-col gap-0.5 pt-0.5">
                              <button
                                type="button"
                                onClick={() => handleMoveItem(idx, "up")}
                                disabled={idx === 0 || reordering}
                                className="flex h-5 w-5 items-center justify-center rounded text-stone hover:text-ink disabled:opacity-30 transition-colors"
                                aria-label="Mover para cima"
                              >
                                <ArrowUp size={12} strokeWidth={1.5} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveItem(idx, "down")}
                                disabled={idx === items.length - 1 || reordering}
                                className="flex h-5 w-5 items-center justify-center rounded text-stone hover:text-ink disabled:opacity-30 transition-colors"
                                aria-label="Mover para baixo"
                              >
                                <ArrowDown size={12} strokeWidth={1.5} />
                              </button>
                            </div>
                          )}

                          <ItemIcon type={item.type} />

                          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {item.start_time && (
                                <span className="flex-shrink-0 text-xs font-mono text-stone">
                                  {item.start_time}
                                </span>
                              )}
                              <span className="text-sm font-medium text-ink dark:text-white truncate">
                                {item.name}
                              </span>
                              <span className="ml-auto flex-shrink-0 text-xs text-stone">
                                {ITEM_TYPE_LABELS[item.type]}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                              {item.duration_minutes != null && (
                                <span className="text-xs text-stone">
                                  {item.duration_minutes} min
                                </span>
                              )}
                              {item.responsible && (
                                <span className="text-xs text-stone">
                                  {item.responsible.full_name}
                                </span>
                              )}
                            </div>

                            {item.notes && (
                              <p className="mt-1 text-xs text-stone italic">{item.notes}</p>
                            )}
                          </div>

                          {/* Delete */}
                          {canEdit && !isReadOnly && (
                            <button
                              type="button"
                              onClick={() => handleDeleteItem(item.id)}
                              disabled={deletingItemId === item.id}
                              className="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded text-stone hover:text-crimson transition-colors disabled:opacity-40"
                              aria-label="Remover etapa"
                            >
                              {deletingItemId === item.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Trash2 size={12} strokeWidth={1.5} />
                              )}
                            </button>
                          )}
                        </div>

                        {/* Setlist section — only for worship items */}
                        {item.type === "worship" && (
                          <div className="border-t border-[var(--border-default)] bg-[var(--surface-subtle)] px-4 py-3">
                            {/* Song list */}
                            {setlist && setlist.songs.length > 0 && (
                              <div className="flex flex-col gap-1 mb-2">
                                {[...setlist.songs]
                                  .sort((a, b) => a.position - b.position)
                                  .map((song) => (
                                    <div
                                      key={song.id}
                                      className="flex items-center gap-2 text-xs"
                                    >
                                      <Music size={11} strokeWidth={1.5} className="flex-shrink-0 text-stone" />
                                      <span className="flex-1 truncate text-ink dark:text-white">
                                        {song.title}
                                      </span>
                                      {song.key && (
                                        <span className="flex-shrink-0 rounded px-1 py-0.5 font-mono text-[10px] bg-[var(--surface-base)] text-stone border border-[var(--border-default)]">
                                          {song.key}
                                        </span>
                                      )}
                                      {song.bpm != null && (
                                        <span className="flex-shrink-0 text-stone">{song.bpm} BPM</span>
                                      )}
                                      {song.link && (
                                        <a
                                          href={song.link}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex-shrink-0 text-stone hover:text-navy transition-colors"
                                          aria-label="Abrir link"
                                        >
                                          <ExternalLink size={11} strokeWidth={1.5} />
                                        </a>
                                      )}
                                      {canAddSongs && (
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteSong(song.id, item.id)}
                                          className="flex-shrink-0 text-stone hover:text-crimson transition-colors"
                                          aria-label="Remover música"
                                        >
                                          <X size={11} strokeWidth={1.5} />
                                        </button>
                                      )}
                                    </div>
                                  ))}
                              </div>
                            )}

                            {/* Add song button / form */}
                            {canAddSongs && !isReadOnly && (
                              isShowingSongForm && setlist ? (
                                <AddSongForm
                                  setlistId={setlist.id}
                                  nextPosition={(setlist.songs.length ?? 0) + 1}
                                  onAdded={afterAddSong}
                                  onCancel={() => setAddSongForItemId(null)}
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleCreateSetlist(item)}
                                  className="flex items-center gap-1 text-xs text-stone hover:text-navy transition-colors"
                                >
                                  <Plus size={11} strokeWidth={1.5} />
                                  Adicionar música
                                </button>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Toast */}
            {toastMsg && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-[8px] bg-ink px-4 py-2.5 text-sm text-white shadow-lg dark:bg-[var(--surface-subtle)] dark:text-ink max-w-xs text-center">
                {toastMsg}
              </div>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      {serviceOrder && (
        <AddItemModal
          open={addItemOpen}
          onOpenChange={setAddItemOpen}
          serviceOrderId={serviceOrder.id}
          nextPosition={items.length + 1}
          onAdded={afterAddItem}
        />
      )}
    </>
  );
}
