"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  Loader2, X, Plus, ArrowUp, ArrowDown, Trash2, ExternalLink,
  Music, BookOpen, Heart, Megaphone, Wallet, Clock, FileDown, Link2, Unlink,
  SquarePlay, Disc3, FileMusic,
} from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddItemModal, ITEM_TYPE_LABELS, type ItemType } from "@/components/celebrations/AddItemModal";
import { SongPicker } from "@/components/repertorio/SongPicker";
import { cn } from "@/lib/utils";
import { songKey, type CatalogSong } from "@/lib/repertorio";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SetlistSong {
  id: string;
  title: string;
  key?: string;
  bpm?: number;
  link?: string;
  sequence: number;
  song_id?: string | null;
  /**
   * Referência do catálogo, lida pela relação e não copiada: `null` quando a
   * música é avulsa ou quando o `Song` foi removido do catálogo (SetNull).
   * Título, tom, BPM e link da setlist continuam sendo cópia congelada.
   */
  song?: {
    id: string;
    title: string;
    key: string | null;
    key_alt: string | null;
    youtube_link: string | null;
    spotify_link: string | null;
    cifra_club_link: string | null;
  } | null;
}

interface Setlist {
  id: string;
  songs: SetlistSong[];
}

interface ServiceOrderItem {
  id: string;
  name: string;
  type: ItemType;
  sequence: number;
  duration_minutes: number;
  start_offset_minutes: number;
  responsible_type: "person" | "ministry" | "free_text";
  person?: { id: string; full_name: string } | null;
  ministry?: { id: string; name: string } | null;
  responsible_label?: string | null;
  notes?: string | null;
  setlist?: Setlist | null;
}

interface ServiceOrder {
  id: string;
  title: string;
  published_at?: string | null;
  items: ServiceOrderItem[];
}

interface CelebrationInstance {
  id: string;
  scheduled_date: string;
  celebration: { id: string; name: string; start_time?: string };
  serviceOrder?: { id: string; title: string; published_at: string | null } | null;
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

// `start_offset_minutes` é minutos desde o início da celebração — converte de
// volta para "HH:mm" para exibição, quando o horário de início é conhecido.
function fmtItemTime(startOffsetMinutes: number, celebrationStartTime?: string): string | null {
  if (!celebrationStartTime) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(celebrationStartTime);
  if (!match) return null;
  const totalMinutes = parseInt(match[1], 10) * 60 + parseInt(match[2], 10) + startOffsetMinutes;
  const hh = String(Math.floor(totalMinutes / 60) % 24).padStart(2, "0");
  const mm = String(totalMinutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function responsibleLabel(item: {
  responsible_type: "person" | "ministry" | "free_text";
  person?: { full_name: string } | null;
  ministry?: { name: string } | null;
  responsible_label?: string | null;
}): string | null {
  if (item.responsible_type === "person") return item.person?.full_name ?? null;
  if (item.responsible_type === "ministry") return item.ministry?.name ?? null;
  return item.responsible_label ?? null;
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
  canCreate: boolean;
  onAdded: () => void;
  onCancel: () => void;
}

function AddSongForm({ setlistId, nextPosition, canCreate, onAdded, onCancel }: AddSongFormProps) {
  const [selectedSong, setSelectedSong] = useState<CatalogSong | null>(null);
  const [title, setTitle] = useState("");
  const [key, setKey] = useState("");
  const [bpm, setBpm] = useState("");
  const [link, setLink] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Escolher uma música do catálogo preenche os campos como valores default,
  // ainda editáveis por baixo — sem travar entrada avulsa (REPERT-02).
  function handleSelectSong(song: CatalogSong) {
    setSelectedSong(song);
    setTitle(song.title);
    // Quando só o tom alternativo está cadastrado, ele é a única opção do
    // seletor abaixo — o estado precisa começar nele para não divergir do
    // que a tela mostra como selecionado.
    setKey(songKey(song) ?? "");
    setBpm(song.bpm != null ? String(song.bpm) : "");
    setLink(song.link ?? "");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Título é obrigatório."); return; }
    setError("");
    setIsSubmitting(true);
    try {
      // SPEC_DEVIATION: a chamada anterior ia para
      // `/celebrations/setlists/${setlistId}/songs` com `position` — essa
      // rota não existe (o controller real é `POST /celebrations/setlists/songs`,
      // com `setlist_id` no corpo e `sequence`, não `position`). Corrigido
      // aqui porque T12 precisa deste POST funcionando de verdade para levar
      // `song_id`; achado pré-existente, fora do escopo de REPERT-02.
      await api.post(`/celebrations/setlists/songs`, {
        setlist_id: setlistId,
        song_id: selectedSong?.id ?? undefined,
        sequence: nextPosition,
        title: title.trim(),
        key: key.trim() || undefined,
        bpm: bpm ? parseInt(bpm, 10) : undefined,
        link: link.trim() || undefined,
      });
      onAdded();
    } catch {
      setError("Erro ao adicionar música.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    // O picker fica FORA do `<form>` de propósito. Ele tem campos de texto
    // (a busca e o cadastro inline), e o form abaixo tem `type="submit"` —
    // dentro dele, Enter em qualquer um desses campos disparava a submissão
    // implícita do form da setlist: com título já preenchido, um POST real em
    // `/celebrations/setlists/songs`; sem título, o erro "Título é obrigatório"
    // num form que o usuário nem está vendo. O `<select>` que existia aqui
    // antes não tinha esse comportamento, então a regressão nasceu com o
    // picker. Separar as duas árvores resolve a classe do problema, em vez de
    // barrar a tecla caso a caso.
    <div className="flex flex-col gap-2 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-subtle)] p-3 mt-2">
      <SongPicker canCreate={canCreate} onSelect={handleSelectSong} />
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-2">
        {selectedSong?.key_alt && (
          <select
            aria-label="Tom confirmado para a escala"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            disabled={isSubmitting}
            className="h-8 rounded-[6px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
          >
            {selectedSong.key && <option value={selectedSong.key}>Tom {selectedSong.key}</option>}
            <option value={selectedSong.key_alt}>Tom alt. {selectedSong.key_alt}</option>
          </select>
        )}
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
    </div>
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
  const [noOC, setNoOC] = useState(false);
  const [isCreatingOC, setIsCreatingOC] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addSongForItemId, setAddSongForItemId] = useState<string | null>(null);
  const [linkSongId, setLinkSongId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  // Carregamento é derivado: qual requisição já terminou. `reloadTick` sobe a
  // cada recarga disparada por um evento (adicionar etapa, música, reverter
  // reordenação). Evita setState síncrono dentro do effect.
  const [reloadTick, setReloadTick] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const requestKey = instanceId ? `${instanceId}|${reloadTick}` : null;
  const isLoading = open && requestKey !== null && loadedKey !== requestKey;

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3000);
  }

  // Cadeia de promises em vez de async/await: assim todo setState acontece
  // dentro de um callback, nunca de forma síncrona no corpo do effect.
  useEffect(() => {
    if (!open || !instanceId) return;
    const id = instanceId;
    // Cancelamento evita que uma resposta antiga sobrescreva o estado.
    const signal = { cancelled: false };
    // Load instance details — o vínculo com a OC vem embutido (`serviceOrder`),
    // não existe rota `GET /celebrations/instances/:id/service-order`.
    api
      .get<CelebrationInstance>(`/celebrations/instances/${id}`)
      .then((instRes) => {
        if (signal.cancelled) return;
        setInstance(instRes.data);
        const soId = instRes.data.serviceOrder?.id;
        if (!soId) {
          setServiceOrder(null);
          setItems([]);
          setNoOC(true);
          return;
        }
        return api
          .get<ServiceOrder>(`/celebrations/orders/${soId}`)
          .then((soRes) => {
            if (signal.cancelled) return;
            setServiceOrder(soRes.data);
            setItems([...(soRes.data.items ?? [])].sort((a, b) => a.sequence - b.sequence));
            setNoOC(false);
          });
      })
      .catch(() => {
        if (signal.cancelled) return;
        setNoOC(false);
      })
      .finally(() => {
        if (!signal.cancelled) setLoadedKey(`${id}|${reloadTick}`);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [open, instanceId, reloadTick]);

  // Reset ao fechar acontece no handler, não em effect.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setInstance(null);
      setServiceOrder(null);
      setItems([]);
      setNoOC(false);
      setAddItemOpen(false);
      setAddSongForItemId(null);
      setLinkSongId(null);
      setLoadedKey(null);
    }
    onOpenChange(next);
  }

  // Recarga disparada por evento.
  function reloadData() {
    setReloadTick((t) => t + 1);
  }

  async function handleCreateOC() {
    if (!instanceId) return;
    setIsCreatingOC(true);
    try {
      // Botão só existe depois que `noOC` vira true, o que só acontece junto
      // com `setInstance` na mesma resolução do effect — `instance` sempre
      // está preenchido aqui.
      const { data } = await api.post<ServiceOrder>("/celebrations/orders", {
        celebration_instance_id: instanceId,
        title: `Ordem de Culto — ${instance!.celebration.name}`,
      });
      setServiceOrder({ ...data, items: [] });
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
      await api.delete(`/celebrations/items/${itemId}`);
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

    // Swap sequences in local state
    const seqA = newItems[index].sequence;
    const seqB = newItems[targetIndex].sequence;
    newItems[index] = { ...newItems[index], sequence: seqB };
    newItems[targetIndex] = { ...newItems[targetIndex], sequence: seqA };
    newItems.sort((a, b) => a.sequence - b.sequence);
    setItems(newItems);

    // Persist both
    setReordering(true);
    try {
      await Promise.all([
        api.patch(`/celebrations/items/${items[index].id}`, { sequence: seqB }),
        api.patch(`/celebrations/items/${items[targetIndex].id}`, { sequence: seqA }),
      ]);
    } catch {
      // Revert on error
      if (instanceId) reloadData();
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

  /**
   * Vincula (ou desvincula, com `song_id: null`) a música da setlist ao
   * catálogo. O corpo leva **apenas** `song_id`: vincular declara a origem,
   * não reimporta tom/BPM/link — o que a escala confirmou fica como está
   * (SETREP-01 AC2/AC3).
   */
  async function handleLinkSong(setlistSongId: string, song: CatalogSong | null) {
    try {
      await api.patch(`/celebrations/setlists/songs/${setlistSongId}`, {
        song_id: song ? song.id : null,
      });
      setLinkSongId(null);
      afterAddSong();
    } catch {
      showToast("Erro ao vincular música.");
    }
  }

  // After adding item: reload OC
  function afterAddItem() {
    if (!instanceId) return;
    reloadData();
  }

  // After adding song: reload
  function afterAddSong() {
    setAddSongForItemId(null);
    if (!instanceId) return;
    reloadData();
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
    if (!serviceOrder) return;
    setIsExporting(true);
    try {
      // O endpoint gera o PDF de forma assíncrona e devolve a URL assinada
      // (armazenamento), não o binário — não há blob para baixar aqui.
      const { data } = await api.get<{ pdf_url: string }>(
        `/celebrations/orders/${serviceOrder.id}/pdf`
      );
      window.open(data.pdf_url, "_blank", "noopener,noreferrer");
    } catch {
      showToast("Exportação PDF não disponível.");
    } finally {
      setIsExporting(false);
    }
  }

  const isReadOnly = !canEdit;

  return (
    <>
      <Dialog.Root open={open} onOpenChange={handleOpenChange}>
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
                    {fmtDate(instance.scheduled_date)}
                    {instance.celebration.start_time ? ` · ${instance.celebration.start_time}` : ""}
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
                              {(() => {
                                const itemTime = fmtItemTime(item.start_offset_minutes, instance?.celebration.start_time);
                                return itemTime ? (
                                  <span className="flex-shrink-0 text-xs font-mono text-stone">
                                    {itemTime}
                                  </span>
                                ) : null;
                              })()}
                              <span className="text-sm font-medium text-ink dark:text-white truncate">
                                {item.name}
                              </span>
                              <span className="ml-auto flex-shrink-0 text-xs text-stone">
                                {ITEM_TYPE_LABELS[item.type]}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                              <span className="text-xs text-stone">
                                {item.duration_minutes} min
                              </span>
                              {responsibleLabel(item) && (
                                <span className="text-xs text-stone">
                                  {responsibleLabel(item)}
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
                                  .sort((a, b) => a.sequence - b.sequence)
                                  .map((song) => (
                                    <div key={song.id} className="flex flex-col gap-1">
                                    <div
                                      className="flex items-center gap-2 text-xs"
                                    >
                                      <Music size={11} strokeWidth={1.5} className="flex-shrink-0 text-stone" />
                                      <span className="flex-1 truncate text-ink dark:text-white">
                                        {song.title}
                                      </span>
                                      {song.song && (
                                        <span className="flex-shrink-0 rounded px-1 py-0.5 text-[10px] bg-teal/10 text-teal">
                                          Repertório
                                        </span>
                                      )}
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
                                      {/*
                                        Referências do catálogo: cada uma com
                                        rótulo próprio, para não virarem três
                                        ícones iguais sem nome (SETREP-04 AC3).
                                        O link congelado da setlist, acima, é
                                        outro campo — não há duplicata.
                                      */}
                                      {song.song?.youtube_link && (
                                        <a
                                          href={song.song.youtube_link}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex-shrink-0 text-stone hover:text-navy transition-colors"
                                          aria-label={`Abrir no YouTube: ${song.title}`}
                                        >
                                          <SquarePlay size={11} strokeWidth={1.5} />
                                        </a>
                                      )}
                                      {song.song?.spotify_link && (
                                        <a
                                          href={song.song.spotify_link}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex-shrink-0 text-stone hover:text-navy transition-colors"
                                          aria-label={`Abrir no Spotify: ${song.title}`}
                                        >
                                          <Disc3 size={11} strokeWidth={1.5} />
                                        </a>
                                      )}
                                      {song.song?.cifra_club_link && (
                                        <a
                                          href={song.song.cifra_club_link}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex-shrink-0 text-stone hover:text-navy transition-colors"
                                          aria-label={`Abrir a cifra no Cifra Club: ${song.title}`}
                                        >
                                          <FileMusic size={11} strokeWidth={1.5} />
                                        </a>
                                      )}
                                      {canAddSongs && !isReadOnly && (
                                        song.song_id ? (
                                          <button
                                            type="button"
                                            onClick={() => handleLinkSong(song.id, null)}
                                            className="flex-shrink-0 text-stone hover:text-navy transition-colors"
                                            aria-label={`Desvincular ${song.title} do repertório`}
                                          >
                                            <Unlink size={11} strokeWidth={1.5} />
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => setLinkSongId(song.id)}
                                            className="flex-shrink-0 text-stone hover:text-navy transition-colors"
                                            aria-label={`Vincular ${song.title} ao repertório`}
                                          >
                                            <Link2 size={11} strokeWidth={1.5} />
                                          </button>
                                        )
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
                                    {linkSongId === song.id && (
                                      <SongPicker
                                        canCreate={canAddSongs}
                                        onSelect={(chosen) => handleLinkSong(song.id, chosen)}
                                        onCancel={() => setLinkSongId(null)}
                                      />
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
                                  canCreate={canAddSongs}
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
          nextSequence={items.length + 1}
          celebrationStartTime={instance?.celebration.start_time}
          onAdded={afterAddItem}
        />
      )}
    </>
  );
}
