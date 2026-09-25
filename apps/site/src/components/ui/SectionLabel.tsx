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
      className={`inline-flex items-center gap-2.5 text-sm font-medium ${className}`}
      style={{ color }}
    >
      <span className="w-6 h-px" style={{ background: lineColor ?? color }} />
      {children}
    </p>
  );
}
