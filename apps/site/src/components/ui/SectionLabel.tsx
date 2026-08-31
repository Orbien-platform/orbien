import { type ReactNode } from "react";

interface SectionLabelProps {
  children: ReactNode;
  className?: string;
  color?: string;
  lineColor?: string;
}

export function SectionLabel({
  children,
  className = "",
  color = "var(--navy-accent)",
  lineColor,
}: SectionLabelProps) {
  return (
    <p
      className={`inline-flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[.14em] ${className}`}
      style={{ color }}
    >
      <span className="w-6 h-px" style={{ background: lineColor ?? color }} />
      {children}
    </p>
  );
}
