"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ClipboardList, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";

export const navItems = [
  { href: "/tenants", label: "Tenants", icon: Building2 },
  { href: "/waitlist", label: "Waitlist", icon: ClipboardList },
  { href: "/auditoria", label: "Auditoria", icon: ScrollText },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-[240px] flex-col border-r border-[var(--border-default)] bg-[var(--surface-base)]">
      <div className="flex flex-col gap-0.5 border-b border-[var(--border-default)] px-6 py-5">
        <span className="font-sans text-xl font-medium tracking-tight text-navy">
          orbien
        </span>
        {/* Não é o nome de uma igreja: este console não está dentro de tenant
            nenhum, e é justamente isso que habilita as rotas de plataforma. */}
        <span className="text-xs font-normal text-stone">Plataforma</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + "/");
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-[8px] px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "border-l-2 border-navy bg-navy/10 pl-[10px] text-navy"
                      : "border-l-2 border-transparent text-stone hover:bg-[var(--surface-subtle)] hover:text-ink dark:hover:text-white"
                  )}
                >
                  <Icon size={20} strokeWidth={1.5} />
                  <span>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
