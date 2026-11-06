"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { Crown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useChurchIdentity } from "@/contexts/ChurchIdentityContext";
import { filterEntries, paletteEntries } from "@/lib/command-palette";

/**
 * Busca do topo (⌘K / Ctrl+K): abre uma tela do painel pelo nome.
 *
 * Só navega entre telas que o menu mostraria a esta sessão. Buscar pessoa,
 * grupo ou lançamento é outra conversa — pede endpoint de busca e fica para
 * depois; o placeholder do campo não promete o que ainda não existe.
 */
export function CommandPalette() {
  const router = useRouter();
  const { user } = useAuth();
  const { groupTerm } = useChurchIdentity();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const entries = useMemo(
    () => paletteEntries(user, groupTerm.plural),
    [user, groupTerm.plural]
  );
  const results = useMemo(() => filterEntries(entries, query), [entries, query]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      setActive(0);
    }
  }

  function go(href: string) {
    handleOpenChange(false);
    router.push(href);
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = results[active];
      if (target) go(target.href);
    }
  }

  const optionId = (index: number) => `${listId}-opt-${index}`;

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger
        aria-label="Buscar tela"
        className="flex h-9 min-w-0 items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--surface-subtle)] px-3 text-sm text-muted-text outline-none transition-colors hover:border-[var(--border-strong)] focus-visible:ring-2 focus-visible:ring-ring md:w-60"
      >
        <Search size={15} strokeWidth={1.6} aria-hidden="true" className="shrink-0" />
        <span className="hidden flex-1 truncate text-left md:block">Ir para uma tela…</span>
        <kbd className="label-mono hidden rounded border border-[var(--border-default)] px-1.5 py-px text-[10px] md:block">
          ⌘K
        </kbd>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          initialFocus={inputRef}
          className="fixed left-1/2 top-[15vh] z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-[16px] border border-[var(--border-default)] bg-[var(--surface-base)] shadow-[var(--shadow-lg)] transition duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0"
        >
          <Dialog.Title className="sr-only">Ir para uma tela</Dialog.Title>
          <Dialog.Description className="sr-only">
            Digite o nome da tela, use as setas para escolher e Enter para abrir.
          </Dialog.Description>
          <div className="flex items-center gap-2 border-b border-[var(--border-default)] px-4">
            <Search size={16} strokeWidth={1.6} aria-hidden="true" className="text-muted-text" />
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={results.length ? optionId(active) : undefined}
              aria-label="Nome da tela"
              autoComplete="off"
              spellCheck={false}
              placeholder="Ir para uma tela…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={onInputKeyDown}
              className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted-text"
            />
          </div>
          <ul id={listId} role="listbox" aria-label="Telas" className="max-h-80 overflow-y-auto p-2">
            {results.length === 0 ? (
              <li role="presentation" className="px-3 py-6 text-center text-sm text-stone">
                Nenhuma tela com esse nome.
              </li>
            ) : (
              results.map((entry, index) => (
                <li
                  key={entry.href}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === active}
                  onMouseMove={() => setActive(index)}
                  onClick={() => go(entry.href)}
                  className={cn(
                    "flex h-10 cursor-pointer items-center gap-2 rounded-[10px] px-3 text-sm",
                    index === active
                      ? "bg-brand-dim text-brand-ink"
                      : "text-ink"
                  )}
                >
                  <span className="flex-1 truncate">{entry.label}</span>
                  {entry.upgrade && (
                    <Crown
                      size={12}
                      strokeWidth={1.6}
                      aria-label="Premium"
                      className="shrink-0 text-amber-ink"
                    />
                  )}
                  {entry.section && (
                    <span className="label-mono shrink-0 text-[10px]">{entry.section}</span>
                  )}
                </li>
              ))
            )}
          </ul>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
