import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * O que uma lista ou um painel mostra quando não há nada para listar.
 *
 * Direção Órbita (`docs/design/orbita-v2/README.md`): vazio é ícone + título +
 * texto + ação, e a ação é o que a pessoa faz a seguir ("Novo grupo"), não um
 * pedido de desculpas. Sem moldura própria, como o `NoAccessState`: ocupa o
 * lugar do "nenhum X" dentro do card ou da tabela que já tem borda.
 *
 * Para o 403 use `NoAccessState`; para falha de carga, `ErrorState`. Vazio de
 * verdade e falta de acesso não podem parecer a mesma coisa.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Normalmente um botão ou link. */
  action?: ReactNode;
}) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center"
    >
      <Icon size={32} strokeWidth={1.5} aria-hidden="true" className="text-muted-text" />
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="max-w-sm text-sm text-stone">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
