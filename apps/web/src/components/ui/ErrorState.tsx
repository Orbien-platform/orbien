import { CircleAlert } from "lucide-react";

/**
 * O que a tela mostra quando a carga falhou por outro motivo que não o 403.
 *
 * Diz o que aconteceu e oferece o que fazer: "Tentar de novo". Sem moldura
 * própria, igual a `EmptyState` e `NoAccessState`. O `role="alert"` anuncia a
 * falha a quem usa leitor de tela, que não vê a lista sumir.
 */
export function ErrorState({
  title = "Não foi possível carregar.",
  description = "Verifique sua conexão e tente de novo.",
  onRetry,
}: {
  title?: string;
  description?: string;
  /** Sem ela, o estado não desenha o botão. */
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center"
    >
      <CircleAlert size={32} strokeWidth={1.5} aria-hidden="true" className="text-crimson" />
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="max-w-sm text-sm text-stone">{description}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 inline-flex h-9 items-center rounded-full border border-[var(--border-strong)] px-4 text-sm font-medium text-ink outline-none transition-colors hover:border-teal hover:text-teal focus-visible:ring-2 focus-visible:ring-ring"
        >
          Tentar de novo
        </button>
      )}
    </div>
  );
}
