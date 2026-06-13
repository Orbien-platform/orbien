import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface SectionHeaderProps {
  title: string;
  action?: { href: string; label: string };
}

export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-medium text-stone uppercase tracking-wide">
        {title}
      </h2>
      {action && (
        <Link
          href={action.href}
          className="flex items-center gap-0.5 text-xs font-medium text-navy hover:text-[var(--color-navy-dark)] transition-colors"
        >
          {action.label}
          <ChevronRight size={14} strokeWidth={1.5} />
        </Link>
      )}
    </div>
  );
}
