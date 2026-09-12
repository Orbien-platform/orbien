"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2, HeartHandshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NoAccessState } from "@/components/ui/NoAccessState";
import api, { isForbidden } from "@/lib/api";

export interface PrayerRequest {
  id: string;
  content: string;
  is_anonymous: boolean;
  created_at: string;
  person: { id: string; full_name: string } | null;
  is_mine: boolean;
  can_delete: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Pedidos de oração da célula (PROD-01).
 *
 * O 403 aqui é esperado, não excepcional: a API exige participação no grupo,
 * e esta tela é do `(admin)`, onde quem abre a gaveta muitas vezes lidera a
 * congregação sem participar daquela célula. Por isso o painel distingue
 * "sem acesso" de "nenhum pedido" — é a mesma regra da pendência nº 10, e
 * aqui ela não é detalhe: sem ela, a leitura seria "esta célula não tem
 * pedido de oração", que é diferente de "isto fica na célula".
 */
export function PrayerRequestsPanel({ groupId }: { groupId: string }) {
  const [requests, setRequests] = useState<PrayerRequest[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  const [content, setContent] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // "Carregando" é derivado, não um setState no corpo do effect — mesmo
  // padrão de `GroupDetailSheet`, e é o que a regra
  // `react-hooks/set-state-in-effect` cobra: todo setState acontece dentro de
  // um callback.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const requestKey = `${groupId}|${reloadTick}`;
  const loading = loadedKey !== requestKey;

  useEffect(() => {
    const signal = { cancelled: false };
    api
      .get<PrayerRequest[]>(`/small-groups/${groupId}/prayer-requests`)
      .then(({ data }) => {
        if (signal.cancelled) return;
        setRequests(data);
        setForbidden(false);
        setError("");
      })
      .catch((err: unknown) => {
        if (signal.cancelled) return;
        setRequests([]);
        if (isForbidden(err)) {
          setForbidden(true);
          setError("");
        } else {
          setForbidden(false);
          setError("Não foi possível carregar os pedidos de oração.");
        }
      })
      .finally(() => {
        if (!signal.cancelled) setLoadedKey(`${groupId}|${reloadTick}`);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [groupId, reloadTick]);

  async function handleSubmit() {
    const trimmed = content.trim();
    if (trimmed.length < 3 || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await api.post(`/small-groups/${groupId}/prayer-requests`, {
        content: trimmed,
        is_anonymous: isAnonymous,
      });
      setContent("");
      setIsAnonymous(false);
      setReloadTick((n) => n + 1);
    } catch {
      setError("Não foi possível registrar o pedido.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id: string) {
    setRemovingId(id);
    setError("");
    try {
      await api.delete(`/small-groups/${groupId}/prayer-requests/${id}`);
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch {
      setError("Não foi possível remover o pedido.");
    } finally {
      setRemovingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10" data-testid="prayer-loading">
        <Loader2 size={20} className="animate-spin text-stone" />
      </div>
    );
  }

  if (forbidden) return <NoAccessState resource="os pedidos de oração desta célula" />;

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2 border-b border-[var(--border-default)] px-4 py-3">
        <label htmlFor="prayer-content" className="text-xs text-stone">
          Novo pedido
        </label>
        <textarea
          id="prayer-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Pelo que a célula deve orar?"
          className="w-full rounded-md border border-[var(--border-default)] bg-transparent px-3 py-2 text-sm text-ink outline-none focus:border-navy dark:text-white"
        />
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-stone">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
            />
            Anônimo para os outros membros
          </label>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={content.trim().length < 3 || submitting}
            className="bg-navy"
          >
            {submitting ? "Enviando…" : "Registrar pedido"}
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="px-4 py-3 text-sm text-crimson">
          {error}
        </p>
      )}

      {requests.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <HeartHandshake size={24} strokeWidth={1.5} className="text-stone" />
          <p className="text-sm text-stone">Nenhum pedido de oração registrado.</p>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border-default)]">
          {requests.map((r) => (
            <li key={r.id} className="flex items-start gap-3 px-4 py-3">
              <div className="flex flex-1 flex-col gap-1">
                <p className="whitespace-pre-wrap text-sm text-ink dark:text-white">{r.content}</p>
                <span className="text-xs text-stone">
                  {r.person ? r.person.full_name : "Anônimo"}
                  {r.is_anonymous && r.is_mine ? " (anônimo para os outros)" : ""} ·{" "}
                  {formatDate(r.created_at)}
                </span>
              </div>
              {/* Quem pode apagar vem da API (`can_delete`): autor sempre,
                  líder da célula para moderar. Desenhar a lixeira para os
                  outros só produziria 403 no clique. */}
              {r.can_delete && (
                <button
                  type="button"
                  aria-label="Remover pedido"
                  onClick={() => handleRemove(r.id)}
                  disabled={removingId === r.id}
                  className="mt-0.5 text-stone transition-colors hover:text-crimson"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
