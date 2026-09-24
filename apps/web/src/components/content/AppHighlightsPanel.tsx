"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ImageOff, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isImageUrl } from "@/lib/media";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

/** Mesmo teto de `MAX_APP_HIGHLIGHTS` na API. */
export const MAX_APP_HIGHLIGHTS = 10;

interface HighlightPost {
  id: string;
  title: string;
  is_draft: boolean;
  published_at?: string | null;
  media_url?: string | null;
  app_highlight_position?: number | null;
}

function isLive(p: HighlightPost) {
  return !p.is_draft && !!p.published_at;
}

/**
 * Escolhe quais posts vão para o carrossel da home do app, e em que ordem.
 *
 * A lista sai de `GET /content/posts` (que para quem edita inclui rascunho),
 * e não de `GET /content/posts/highlights` — esse só devolve o que está no
 * ar, e aqui o organizador precisa ver também o rascunho que já pôs na fila.
 * Salvar regrava a lista inteira (`PUT /content/posts/highlights`).
 */
export function AppHighlightsPanel({ canEdit }: { canEdit: boolean }) {
  const [posts, setPosts] = useState<HighlightPost[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  // Duas listas: os escolhidos (`highlighted=true`, rascunho incluído, sem
  // depender de estarem entre os mais recentes) e o acervo para escolher.
  // `Promise.all` e não `allSettled` de propósito: com só uma das duas, o
  // painel mostraria uma lista incompleta, e salvar a partir dela tiraria do
  // carrossel quem faltou. Falhou uma, falha o painel, e sem botão de salvar.
  // Carrega uma vez; todo setState fica depois do `await`, que é o que
  // `react-hooks/set-state-in-effect` cobra.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<{ data: HighlightPost[] }>("/content/posts", {
        params: { highlighted: true, limit: MAX_APP_HIGHLIGHTS },
      }),
      api.get<{ data: HighlightPost[] }>("/content/posts", { params: { limit: 100 } }),
    ])
      .then(([chosen, pool]) => {
        if (cancelled) return;
        const picked = [...(chosen.data.data ?? [])].sort(
          (a, b) => (a.app_highlight_position ?? 0) - (b.app_highlight_position ?? 0),
        );
        const ids = picked.map((p) => p.id);
        const rest = (pool.data.data ?? []).filter((p) => !ids.includes(p.id));
        setPosts([...picked, ...rest]);
        setSelected(ids);
        setSaved(ids);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const byId = new Map(posts.map((p) => [p.id, p]));
  const available = posts.filter((p) => !selected.includes(p.id));
  const dirty = selected.join() !== saved.join();
  const full = selected.length >= MAX_APP_HIGHLIGHTS;

  function move(index: number, delta: -1 | 1) {
    setSelected((cur) => {
      const next = [...cur];
      const target = index + delta;
      if (target < 0 || target >= next.length) return cur;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      await api.put("/content/posts/highlights", { post_ids: selected });
      setSaved(selected);
      setMessage({ tone: "ok", text: "Destaques salvos. O app mostra a nova ordem na próxima abertura." });
    } catch {
      setMessage({ tone: "error", text: "Não foi possível salvar os destaques." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-stone">
        <Loader2 size={15} className="animate-spin" /> Carregando…
      </div>
    );
  }

  // Erro de carga não pode parecer "nenhum destaque": para quem só lê, é a
  // diferença entre "ninguém escolheu" e "não deu para saber".
  if (loadFailed) {
    return (
      <p role="alert" className="py-8 text-sm text-crimson">
        Não foi possível carregar os destaques. Recarregue a página para tentar de novo.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-stone">
        Os posts escolhidos aparecem no carrossel do topo da home do app, nesta ordem. Sem
        nenhum escolhido, o app mostra os últimos publicados. Rascunho pode entrar na lista,
        mas só aparece no app depois de publicado.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-ink dark:text-white">
          No carrossel ({selected.length}/{MAX_APP_HIGHLIGHTS})
        </h2>
        {selected.length === 0 ? (
          <p className="rounded-[8px] border border-dashed border-[var(--border-default)] px-4 py-6 text-center text-sm text-stone">
            Nenhum post em destaque.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {selected.map((id, index) => {
              const post = byId.get(id);
              if (!post) return null;
              return (
                <li
                  key={id}
                  data-testid={`highlight-${id}`}
                  className="flex items-center gap-3 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] p-2"
                >
                  <span className="w-5 text-center text-sm font-semibold text-stone">{index + 1}</span>
                  <Thumb url={post.media_url} />
                  <PostLabel post={post} />
                  {canEdit && (
                    <div className="flex items-center gap-0.5">
                      <IconButton label="Subir" onClick={() => move(index, -1)} disabled={index === 0}>
                        <ArrowUp size={15} />
                      </IconButton>
                      <IconButton
                        label="Descer"
                        onClick={() => move(index, 1)}
                        disabled={index === selected.length - 1}
                      >
                        <ArrowDown size={15} />
                      </IconButton>
                      <IconButton
                        label="Tirar do destaque"
                        onClick={() => setSelected((cur) => cur.filter((x) => x !== id))}
                      >
                        <X size={15} />
                      </IconButton>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {canEdit && (
        <>
          <div className="flex items-center gap-3">
            <Button
              onClick={save}
              disabled={!dirty || saving}
              className="rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)]"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : "Salvar destaques"}
            </Button>
            {message && (
              <span
                role="status"
                className={cn("text-sm", message.tone === "ok" ? "text-teal" : "text-crimson")}
              >
                {message.text}
              </span>
            )}
          </div>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-ink dark:text-white">Outros posts</h2>
            {available.length === 0 ? (
              <p className="text-sm text-stone">Todos os posts já estão no carrossel.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {available.map((post) => (
                  <li
                    key={post.id}
                    className="flex items-center gap-3 rounded-[8px] border border-[var(--border-default)] p-2"
                  >
                    <Thumb url={post.media_url} />
                    <PostLabel post={post} />
                    <IconButton
                      label="Pôr em destaque"
                      onClick={() => setSelected((cur) => [...cur, post.id])}
                      disabled={full}
                    >
                      <Plus size={15} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function PostLabel({ post }: { post: HighlightPost }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium text-ink dark:text-white">{post.title}</p>
      <p className="text-xs text-stone">
        {isLive(post) ? "Publicado" : "Não publicado — fica fora do app até publicar"}
        {!isImageUrl(post.media_url) && " · sem imagem"}
      </p>
    </div>
  );
}

function Thumb({ url }: { url?: string | null }) {
  if (url && isImageUrl(url)) {
    // eslint-disable-next-line @next/next/no-img-element -- miniatura de URL externa (R2), sem otimização
    return <img src={url} alt="" className="h-10 w-16 shrink-0 rounded object-cover" />;
  }
  return (
    <div className="flex h-10 w-16 shrink-0 items-center justify-center rounded bg-[var(--surface-subtle)] text-stone">
      <ImageOff size={14} />
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-stone hover:bg-[var(--surface-subtle)] hover:text-ink disabled:pointer-events-none disabled:opacity-30 dark:hover:text-white"
    >
      {children}
    </button>
  );
}
