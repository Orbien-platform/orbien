import { Crown } from "lucide-react";

/** Onde o plano é apresentado. Configurável para preview; o padrão é o site no ar. */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://useorbien.com";

/**
 * O que uma área Premium mostra numa igreja Starter.
 *
 * Direção Órbita (`docs/design/orbita-v2/README.md`): recurso Premium no
 * Starter aparece com um convite discreto em vez de sumir — quem usa vê que a
 * área existe e o que ela faz. Diferente do `NoAccessState`, que é para o
 * papel que não alcança a área em plano nenhum.
 *
 * Não é barreira: quem nega a rota é o `PlanGuard` da API. A tela só não
 * chega a pedir o dado que viria 403.
 */
export function PremiumInvite({
  resource,
  description,
}: {
  /** Nome da área, como aparece no menu ("Celebrações"). */
  resource: string;
  /** Uma frase sobre o que a área faz pela igreja. */
  description: string;
}) {
  return (
    <section
      aria-label={`${resource} — disponível no plano Premium`}
      className="mx-auto mt-8 flex max-w-md flex-col items-center gap-3 rounded-[14px] border border-[var(--border-default)] bg-[var(--surface-base)] px-6 py-10 text-center"
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-amber-dim text-amber-ink">
        <Crown size={20} strokeWidth={1.6} aria-hidden="true" />
      </span>
      <p className="label-mono">Disponível no plano Premium</p>
      <p className="text-sm text-stone">{description}</p>
      <a
        href={`${SITE_URL}/precos`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-flex h-9 items-center rounded-full border border-[var(--border-strong)] px-4 text-sm font-medium text-ink transition-colors hover:border-teal hover:text-teal"
      >
        Conhecer o Premium
      </a>
    </section>
  );
}
