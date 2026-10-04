"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { canAccessRoute } from "@/lib/permissions";
import { NAV_SECTIONS, isActiveRoute } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useChurchIdentity } from "@/contexts/ChurchIdentityContext";

function initials(name: string): string {
  return name
    .split(" ")
    .filter((w) => /^[\p{L}\p{N}]/u.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { churchName, congregationName } = useChurchIdentity();

  const title = churchName ?? congregationName ?? "Sua igreja";
  // A congregação só aparece como subtítulo quando diz algo além do nome da
  // igreja — igreja de uma congregação só costuma ter os dois iguais.
  const subtitle =
    congregationName && congregationName !== title ? congregationName : null;

  // Link que só levaria a um 403 não é desenhado. Isto é conveniência, não
  // controle de acesso: quem digitar a URL chega à tela e recebe de lá o
  // "sem acesso" — a autoridade continua sendo o `@Roles` da API.
  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(({ href }) => canAccessRoute(user, href)),
  })).filter((section) => section.items.length > 0);

  return (
    <aside className="flex h-full w-[236px] flex-col border-r border-[var(--border-default)] bg-[var(--surface-base)]">
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3.5">
        <div
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-navy text-[13px] font-semibold text-white"
        >
          {initials(title) || "O"}
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[13.5px] font-medium text-ink">{title}</p>
          {subtitle && <p className="truncate text-xs text-muted-text">{subtitle}</p>}
        </div>
      </div>

      <nav aria-label="Menu do painel" className="flex-1 overflow-y-auto px-2.5 pt-1 pb-3">
        {sections.map((section) => (
          <div key={section.title ?? "inicio"} className={cn(section.title && "mt-3.5")}>
            {section.title && (
              <p className="label-mono px-2 pb-1.5 text-[9.5px]">{section.title}</p>
            )}
            <ul className="flex flex-col gap-px">
              {section.items.map(({ href, label, icon: Icon }) => {
                const active = isActiveRoute(pathname, href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-8 items-center gap-2.5 rounded-[7px] px-2 text-[13.5px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "bg-brand-dim font-medium text-brand-ink"
                          : "text-stone hover:bg-[var(--surface-subtle)] hover:text-ink"
                      )}
                    >
                      <Icon size={16} strokeWidth={1.6} aria-hidden="true" />
                      <span className="truncate">{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-2 border-t border-[var(--border-default)] px-4 py-3">
        <span aria-hidden="true" className="relative inline-block size-4 rounded-full border border-[var(--border-strong)]">
          <span className="absolute -top-px left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-teal" />
        </span>
        <span className="text-xs font-medium tracking-tight text-stone">orbien</span>
      </div>
    </aside>
  );
}
