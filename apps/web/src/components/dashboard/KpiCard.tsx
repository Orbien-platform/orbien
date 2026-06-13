import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: string;
  delta?: string;
  deltaType?: "up" | "down" | "neutral";
  icon: LucideIcon;
  suffix?: string;
  mono?: boolean;
  isLoading?: boolean;
  children?: React.ReactNode;
}

export function KpiCard({
  title,
  value,
  delta,
  deltaType = "neutral",
  icon: Icon,
  suffix,
  mono,
  isLoading,
  children,
}: KpiCardProps) {
  const DeltaIcon =
    deltaType === "up" ? TrendingUp : deltaType === "down" ? TrendingDown : Minus;

  return (
    <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-stone">{title}</p>
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[8px] bg-[var(--surface-subtle)]">
          <Icon size={16} strokeWidth={1.5} className="text-stone" />
        </div>
      </div>

      {isLoading ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
      ) : (
        <div className="mt-3">
          <div className="flex items-baseline gap-1.5">
            {suffix && (
              <span className="text-sm font-normal text-stone">{suffix}</span>
            )}
            <span
              className={cn(
                "text-2xl font-medium text-ink dark:text-white",
                mono && "font-mono"
              )}
            >
              {value}
            </span>
          </div>

          {delta && (
            <div
              className={cn(
                "mt-1.5 flex items-center gap-1 text-xs font-medium",
                deltaType === "up" && "text-teal",
                deltaType === "down" && "text-crimson",
                deltaType === "neutral" && "text-stone"
              )}
            >
              <DeltaIcon size={12} strokeWidth={2} />
              <span>{delta}</span>
            </div>
          )}

          {children && <div className="mt-3">{children}</div>}
        </div>
      )}
    </div>
  );
}
