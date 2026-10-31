"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/kids", label: "Balcão" },
  { href: "/kids/criancas", label: "Crianças" },
  { href: "/kids/turmas", label: "Turmas" },
] as const;

/**
 * Navegação interna do módulo Kids. "Balcão" é a raiz, então só casa por
 * igualdade — senão ficaria marcado também em Crianças e Turmas.
 */
export function KidsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Kids" className="flex border-b border-[var(--border-default)]">
      {ITEMS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative px-4 py-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
              active
                ? "text-navy after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-navy dark:text-white"
                : "text-stone hover:text-ink dark:hover:text-white",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
