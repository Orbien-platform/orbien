import { cn } from "@/lib/utils";

/**
 * O código de retirada: o objeto que a equipe e o responsável reconhecem a
 * três metros. Quatro caracteres, mono tabular, espaçamento largo — cada
 * caractere numa célula de largura fixa para 2 e Z, B e 8 nunca se emendarem.
 *
 * O leitor de tela recebe os caracteres separados (“A, 2, B, 3”); lido como
 * palavra, “A2B3” viraria ruído.
 */
export function PickupCode({ code, size = "lg", className }: { code: string; size?: "lg" | "xl"; className?: string }) {
  return (
    <span
      role="img"
      aria-label={`Código de retirada: ${code.split("").join(", ")}`}
      className={cn(
        "inline-flex items-center gap-[0.18em] font-mono font-semibold leading-none tabular-nums text-ink dark:text-white",
        size === "xl" ? "text-[clamp(4rem,14vw,7rem)]" : "text-5xl",
        className,
      )}
    >
      {code.split("").map((ch, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="inline-flex w-[0.8em] justify-center rounded-[0.12em] border border-[var(--border-strong)] bg-[var(--surface-subtle)] py-[0.12em]"
        >
          {ch}
        </span>
      ))}
    </span>
  );
}
