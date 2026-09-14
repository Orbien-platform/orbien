"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Loader2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api, { isForbidden } from "@/lib/api";
import { formatInstant } from "@/lib/datetime";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EventRegistration {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: "confirmed" | "waitlisted" | "cancelled";
  created_at: string;
}

interface RegistrationsResponse {
  data: EventRegistration[];
  registration_enabled: boolean;
  registration_limit: number | null;
  registration_deadline: string | null;
  registrations_closed: boolean;
  confirmed_count: number;
  waitlisted_count: number;
  seats_left: number | null;
}

interface EventRegistrationsPanelProps {
  postId: string;
  /** Recarrega quando o post é salvo — limite e prazo podem ter mudado. */
  reloadKey?: number;
}

function fmt(iso: string): string {
  return formatInstant(iso, { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * A lista de inscritos de um evento (`PROD-16`), dentro do `PostDetailSheet`.
 *
 * Componente próprio, e não mais um bloco no sheet: ele já carrega post,
 * segmentos, mídia e edição, e a inscrição tem ciclo de vida próprio —
 * recarrega sozinha depois de inscrever ou cancelar, sem recarregar o post.
 *
 * Só o organizador chega aqui: o sheet é tela do `(admin)`, e
 * `GET .../registrations` responde 403 para os demais papéis. A tela de quem
 * se inscreve é outra (mobile/membro), e usa `.../summary` e `.../me`.
 */
export function EventRegistrationsPanel({ postId, reloadKey = 0 }: EventRegistrationsPanelProps) {
  const [info, setInfo] = useState<RegistrationsResponse | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [tick, setTick] = useState(0);
  const requestKey = `${postId}|${reloadKey}|${tick}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const isLoading = loadedKey !== requestKey;

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const signal = { cancelled: false };
    api
      .get<RegistrationsResponse>(`/content/posts/${postId}/registrations`)
      .then(({ data }) => {
        if (signal.cancelled) return;
        setInfo(data);
        setAccessDenied(false);
        setLoadError(false);
      })
      .catch((error) => {
        if (signal.cancelled) return;
        setInfo(null);
        setAccessDenied(isForbidden(error));
        setLoadError(!isForbidden(error));
      })
      .finally(() => {
        if (!signal.cancelled) setLoadedKey(requestKey);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [requestKey, postId]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      setFormError("Nome é obrigatório.");
      return;
    }
    setFormError("");
    setIsSubmitting(true);
    try {
      await api.post(`/content/posts/${postId}/registrations`, {
        full_name: fullName.trim(),
        email: email.trim() || undefined,
      });
      setFullName("");
      setEmail("");
      setAdding(false);
      reload();
    } catch (error) {
      // 409 é a única falha que o organizador consegue corrigir sozinho, e
      // dizer "erro ao inscrever" nela esconde a única informação útil.
      const status = (error as { response?: { status?: number } })?.response?.status;
      setFormError(
        status === 409
          ? "Esta pessoa já está inscrita neste evento."
          : "Não foi possível inscrever. Tente novamente."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancel(registrationId: string) {
    try {
      await api.delete(`/content/posts/${postId}/registrations/${registrationId}`);
      reload();
    } catch {
      setFormError("Não foi possível cancelar a inscrição.");
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 border-t border-[var(--border-default)] pt-3 text-sm text-stone">
        <Loader2 size={14} className="animate-spin" />
        Carregando inscrições…
      </div>
    );
  }

  // 403 aqui é papel sem acesso à lista, não evento sem inscritos — e a
  // diferença importa: "nenhum inscrito" faria o organizador achar que
  // ninguém se inscreveu.
  if (accessDenied) return null;

  if (loadError || !info) {
    return (
      <div className="flex items-center justify-between border-t border-[var(--border-default)] pt-3 text-sm text-stone">
        <span>Não foi possível carregar as inscrições.</span>
        <button type="button" onClick={reload} className="text-navy hover:underline">
          Tentar de novo
        </button>
      </div>
    );
  }

  if (!info.registration_enabled) {
    return (
      <div className="border-t border-[var(--border-default)] pt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-stone">Inscrições</p>
        <p className="mt-1 text-sm text-stone">
          Este evento está sem inscrição. Edite o post para abrir.
        </p>
      </div>
    );
  }

  const confirmed = info.data.filter((r) => r.status === "confirmed");
  const waitlisted = info.data.filter((r) => r.status === "waitlisted");

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--border-default)] pt-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-stone">Inscrições</p>
          <p className="mt-0.5 text-sm text-ink dark:text-white">
            {info.confirmed_count} confirmada{info.confirmed_count !== 1 ? "s" : ""}
            {info.registration_limit !== null && ` de ${info.registration_limit}`}
            {info.waitlisted_count > 0 && ` · ${info.waitlisted_count} na fila de espera`}
          </p>
          {info.registration_deadline && (
            <p className="mt-0.5 text-xs text-stone">
              {info.registrations_closed ? "Prazo encerrado em " : "Inscrições até "}
              {fmt(info.registration_deadline)}
            </p>
          )}
        </div>
        {!adding && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-[8px]"
            onClick={() => setAdding(true)}
          >
            <UserPlus size={14} strokeWidth={1.5} />
            Inscrever
          </Button>
        )}
      </div>

      {adding && (
        <form onSubmit={handleAdd} noValidate className="flex flex-col gap-2 rounded-[8px] bg-[var(--surface-subtle)] p-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="er-name" className="text-xs font-medium text-ink dark:text-white">
              Nome <span className="text-crimson">*</span>
            </Label>
            <Input
              id="er-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nome de quem vai"
              disabled={isSubmitting}
              className="rounded-[8px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="er-email" className="text-xs font-medium text-ink dark:text-white">
              E-mail <span className="text-xs font-normal text-stone">(opcional)</span>
            </Label>
            <Input
              id="er-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
              className="rounded-[8px]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              type="button"
              className="rounded-[8px]"
              onClick={() => {
                setAdding(false);
                setFormError("");
              }}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              type="submit"
              className="rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)]"
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : "Inscrever"}
            </Button>
          </div>
        </form>
      )}

      {formError && <p className="text-sm text-crimson">{formError}</p>}

      {info.data.length === 0 ? (
        <p className="text-sm text-stone italic">Ninguém se inscreveu ainda.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {[...confirmed, ...waitlisted].map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-2 rounded-[8px] px-2 py-1.5 hover:bg-[var(--surface-subtle)]"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm text-ink dark:text-white">{r.full_name}</span>
                <span className="truncate text-xs text-stone">
                  {r.email ?? "sem e-mail"} · {fmt(r.created_at)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {r.status === "waitlisted" && (
                  <span className="rounded-full bg-[var(--surface-subtle)] px-2 py-0.5 text-xs text-stone">
                    Fila de espera
                  </span>
                )}
                {/* `<button>` puro: o variant padrão do `Button` pinta fundo
                    escuro, e aqui é só um ícone. Ver o CLAUDE.md da raiz. */}
                <button
                  type="button"
                  aria-label={`Cancelar inscrição de ${r.full_name}`}
                  onClick={() => handleCancel(r.id)}
                  className="rounded-[6px] p-1 text-stone hover:bg-[var(--surface-subtle)] hover:text-crimson"
                >
                  <X size={14} strokeWidth={1.5} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
