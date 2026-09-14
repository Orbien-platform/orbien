"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessagesSquare, Send, Trash2 } from "lucide-react";
import { NoAccessState } from "@/components/ui/NoAccessState";
import api, { isForbidden } from "@/lib/api";
import { formatInstant } from "@/lib/datetime";

export interface GroupMessage {
  id: string;
  content: string;
  created_at: string;
  person: { id: string; full_name: string };
  is_mine: boolean;
  is_deleted: boolean;
  can_delete: boolean;
}

interface GroupMessagePage {
  messages: GroupMessage[];
  has_more: boolean;
}

/** Intervalo do polling. Conversa de célula não é tempo real — ver o comentário do componente. */
const POLL_MS = 15_000;

function formatSentAt(iso: string): string {
  return formatInstant(iso, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Chat fechado da célula (PROD-09).
 *
 * Duas decisões que valem a pena ler antes de mexer:
 *
 * 1. **Polling, não websocket.** A API não tem gateway de tempo real e nada
 *    mais na base tem — buscar dados aqui é `useEffect` + axios, como no
 *    resto do `apps/web`. Conversa de célula tolera 15 segundos de atraso;
 *    abrir uma segunda infra de transporte por causa de uma aba não. O
 *    ciclo pede só o que chegou depois da última mensagem (`after`), então
 *    não rebaixa a conversa inteira a cada volta.
 * 2. **O 403 é esperado, não excepcional** — mesma regra do
 *    `PrayerRequestsPanel`: a API exige `GroupMembership`, e esta tela é do
 *    `(admin)`, onde quem abre a gaveta muitas vezes lidera a congregação
 *    sem participar daquela célula. "Sem acesso" e "nenhuma mensagem" são
 *    coisas diferentes e a tela diz qual das duas é.
 */
export function GroupChatPanel({ groupId }: { groupId: string }) {
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // "Carregando" é derivado, não um setState no corpo do effect — mesmo
  // padrão de `PrayerRequestsPanel`, e é o que a regra
  // `react-hooks/set-state-in-effect` cobra.
  const [loadedGroupId, setLoadedGroupId] = useState<string | null>(null);
  const loading = loadedGroupId !== groupId;

  // A carga inicial e o polling escrevem na mesma lista. O ref evita que um
  // ciclo lento e o seguinte se atropelem e dupliquem mensagem.
  const pollingRef = useRef(false);
  // O ciclo do polling precisa da última mensagem sem depender de `messages`
  // — reagendar o `setInterval` a cada mensagem nova adiaria o ciclo para
  // sempre numa conversa movimentada.
  const messagesRef = useRef<GroupMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const signal = { cancelled: false };
    api
      .get<GroupMessagePage>(`/small-groups/${groupId}/messages`)
      .then(({ data }) => {
        if (signal.cancelled) return;
        setMessages(data.messages);
        setHasMore(data.has_more);
        setForbidden(false);
        setError("");
      })
      .catch((err: unknown) => {
        if (signal.cancelled) return;
        setMessages([]);
        setHasMore(false);
        if (isForbidden(err)) {
          setForbidden(true);
          setError("");
        } else {
          setForbidden(false);
          setError("Não foi possível carregar a conversa.");
        }
      })
      .finally(() => {
        if (!signal.cancelled) setLoadedGroupId(groupId);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [groupId]);

  // Mescla pelo id: a mensagem que este cliente acabou de enviar já está na
  // lista, e o ciclo seguinte do polling a traria de novo.
  const merge = useCallback((incoming: GroupMessage[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const known = new Set(prev.map((m) => m.id));
      const novas = incoming.filter((m) => !known.has(m.id));
      return novas.length === 0 ? prev : [...prev, ...novas];
    });
  }, []);

  useEffect(() => {
    if (loading || forbidden) return;

    // Mesma guarda do effect de carga: o `clearInterval` sozinho não alcança
    // o ciclo que já está no ar quando a gaveta fecha.
    const signal = { cancelled: false };

    const interval = setInterval(() => {
      if (pollingRef.current) return;
      pollingRef.current = true;
      const last = messagesRef.current[messagesRef.current.length - 1];
      const url = last
        ? `/small-groups/${groupId}/messages?after=${last.id}`
        : `/small-groups/${groupId}/messages`;
      api
        .get<GroupMessagePage>(url)
        .then(({ data }) => {
          if (signal.cancelled) return;
          merge(data.messages);
        })
        // Falha de ciclo é silenciosa de propósito: o próximo tenta de novo,
        // e um banner de erro piscando a cada 15 segundos seria pior que o
        // atraso.
        .catch(() => {})
        .finally(() => {
          pollingRef.current = false;
        });
    }, POLL_MS);

    return () => {
      signal.cancelled = true;
      clearInterval(interval);
    };
  }, [groupId, loading, forbidden, merge]);

  async function handleLoadOlder() {
    const first = messages[0];
    if (!first || loadingOlder) return;
    setLoadingOlder(true);
    setError("");
    try {
      const { data } = await api.get<GroupMessagePage>(
        `/small-groups/${groupId}/messages?before=${first.id}`,
      );
      setMessages((prev) => [...data.messages, ...prev]);
      setHasMore(data.has_more);
    } catch {
      setError("Não foi possível carregar as mensagens anteriores.");
    } finally {
      setLoadingOlder(false);
    }
  }

  async function handleSend() {
    const trimmed = content.trim();
    if (trimmed.length === 0 || sending) return;
    setSending(true);
    setError("");
    try {
      const { data } = await api.post<GroupMessage>(`/small-groups/${groupId}/messages`, {
        content: trimmed,
      });
      setContent("");
      merge([data]);
    } catch {
      setError("Não foi possível enviar a mensagem.");
    } finally {
      setSending(false);
    }
  }

  async function handleRemove(id: string) {
    setRemovingId(id);
    setError("");
    try {
      await api.delete(`/small-groups/${groupId}/messages/${id}`);
      // A API apaga por soft delete e a mensagem continua na conversa como
      // lápide — a lista local faz o mesmo, em vez de abrir buraco no meio
      // do histórico.
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, content: "", is_deleted: true, can_delete: false } : m,
        ),
      );
    } catch {
      setError("Não foi possível remover a mensagem.");
    } finally {
      setRemovingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10" data-testid="chat-loading">
        <Loader2 size={20} className="animate-spin text-stone" />
      </div>
    );
  }

  if (forbidden) return <NoAccessState resource="a conversa desta célula" />;

  return (
    <div className="flex flex-col">
      {error && (
        <p role="alert" className="px-4 py-3 text-sm text-crimson">
          {error}
        </p>
      )}

      {hasMore && (
        <div className="flex justify-center border-b border-[var(--border-default)] px-4 py-2">
          <button
            type="button"
            onClick={handleLoadOlder}
            disabled={loadingOlder}
            className="text-xs text-stone transition-colors hover:text-navy"
          >
            {loadingOlder ? "Carregando…" : "Carregar mensagens anteriores"}
          </button>
        </div>
      )}

      {messages.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <MessagesSquare size={24} strokeWidth={1.5} className="text-stone" />
          <p className="text-sm text-stone">Nenhuma mensagem na conversa ainda.</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border-default)]">
          {messages.map((m) => (
            <li key={m.id} className="flex items-start gap-3 px-4 py-3">
              <div className="flex flex-1 flex-col gap-1">
                {m.is_deleted ? (
                  <p className="text-sm italic text-stone">Mensagem removida</p>
                ) : (
                  <p className="whitespace-pre-wrap text-sm text-ink dark:text-white">
                    {m.content}
                  </p>
                )}
                <span className="text-xs text-stone">
                  {m.person.full_name}
                  {m.is_mine ? " (você)" : ""} · {formatSentAt(m.created_at)}
                </span>
              </div>
              {/* Quem pode apagar vem da API (`can_delete`): autor sempre,
                  líder da célula para moderar. Desenhar a lixeira para os
                  outros só produziria 403 no clique. */}
              {m.can_delete && (
                <button
                  type="button"
                  aria-label="Remover mensagem"
                  onClick={() => handleRemove(m.id)}
                  disabled={removingId === m.id}
                  className="mt-0.5 text-stone transition-colors hover:text-crimson"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2 border-t border-[var(--border-default)] px-4 py-3">
        <label htmlFor="chat-content" className="sr-only">
          Mensagem
        </label>
        <textarea
          id="chat-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            // Enter envia, Shift+Enter quebra linha — é o que se espera de
            // um campo de conversa.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          rows={2}
          maxLength={1000}
          placeholder="Escreva para a célula…"
          className="w-full flex-1 resize-none rounded-md border border-[var(--border-default)] bg-transparent px-3 py-2 text-sm text-ink outline-none focus:border-navy dark:text-white"
        />
        {/* `<button>` puro, não `<Button>`: é botão de ícone, e o variant
            padrão do componente pinta fundo escuro que a className não tira. */}
        <button
          type="button"
          aria-label="Enviar mensagem"
          onClick={handleSend}
          disabled={content.trim().length === 0 || sending}
          className="mb-1 text-navy transition-colors hover:text-[var(--color-navy-dark)] disabled:text-stone"
        >
          {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  );
}
