import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Alergia da criança. Nunca depende só de cor: ícone e o texto “Alergia: …”
 * carregam o aviso para quem não distingue o âmbar do resto. Sem alergia
 * informada, não desenha nada (o balcão não pode ficar poluído de “nenhuma”).
 */
export function AllergyNote({ allergy, className }: { allergy: string | null; className?: string }) {
  if (!allergy) return null;
  return (
    <span
      className={cn(
        "inline-flex items-start gap-1.5 rounded-[8px] bg-amber-dim px-2 py-1 text-sm font-medium text-amber-ink",
        className,
      )}
    >
      <TriangleAlert size={15} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>Alergia: {allergy}</span>
    </span>
  );
}
