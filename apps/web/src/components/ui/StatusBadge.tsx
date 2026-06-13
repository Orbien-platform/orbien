import { cn } from "@/lib/utils";

type Classification = "visitor" | "attendee" | "member";

const LABELS: Record<Classification, string> = {
  visitor: "Visitante",
  attendee: "Frequentador",
  member: "Membro",
};

const STYLES: Record<Classification, string> = {
  visitor: "bg-[var(--surface-subtle)] text-stone",
  attendee: "bg-navy-dim text-navy",
  member: "bg-teal-dim text-teal",
};

interface StatusBadgeProps {
  classification: Classification | string;
  className?: string;
}

export function StatusBadge({ classification, className }: StatusBadgeProps) {
  const key = (classification as Classification) in LABELS
    ? (classification as Classification)
    : "visitor";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[100px] px-2 py-0.5 text-xs font-medium",
        STYLES[key],
        className
      )}
    >
      {LABELS[key] ?? classification}
    </span>
  );
}
