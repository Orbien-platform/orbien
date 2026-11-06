"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Entrada de tela da Órbita: fade + translateY(3px), 180 ms (`.page-enter`, em
 * `globals.css`).
 *
 * A chave é o pathname, então a animação roda ao trocar de tela e não a cada
 * renderização. `prefers-reduced-motion` já é tratado pela regra global do
 * `globals.css`, que zera a duração.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
