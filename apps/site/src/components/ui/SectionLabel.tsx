import { type ReactNode } from "react";

interface SectionLabelProps {
  children: ReactNode;
  className?: string;
  color?: string;
  lineColor?: string;
}

/**
 * Rótulo que abre uma seção. Na direção Órbita é Geist Mono em caixa alta
 * espaçada, em teal, com um traço à esquerda (`docs/design/orbita-v2`).
 */
export function SectionLabel({
  children,
  className = "",
  color = "var(--color-teal)",
  lineColor,
}: SectionLabelProps) {
  return (
    <p
      className={`inline-flex items-center gap-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.16em] ${className}`}
      style={{ color }}
    >
      <span className="w-6 h-px" style={{ background: lineColor ?? color }} />
      {children}
    </p>
  );
}
