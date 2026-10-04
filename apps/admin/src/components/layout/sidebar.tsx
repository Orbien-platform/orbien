"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRightLeft, Building2, ClipboardList, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export const navItems = [
  { href: "/tenants", label: "Tenants", icon: Building2 },
  { href: "/waitlist", label: "Waitlist", icon: ClipboardList },
  { href: "/crm", label: "CRM", icon: Users },
  { href: "/contas", label: "Contas", icon: ArrowRightLeft },
  { href: "/auditoria", label: "Auditoria", icon: ShieldCheck },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-[236px] flex-col border-r border-[var(--border-default)] bg-[var(--surface-base)]">
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3.5">
        {/* Marca da Órbita: anel com o satélite teal. */}
        <span
          aria-hidden="true"
          className="relative flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-navy"
        >
          <span className="size-4 rounded-full border border-white/70" />
          <span className="absolute top-[7px] right-[7px] size-1.5 rounded-full bg-teal" />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="text-[13.5px] font-medium tracking-tight text-ink">orbien</p>
          {/* Não é o nome de uma igreja: este console não está dentro de
              tenant nenhum, e é justamente isso que habilita as rotas de
              plataforma. */}
          <p className="text-xs text-muted-text">Plataforma</p>
        </div>
      </div>

      <nav aria-label="Menu do console" className="flex-1 overflow-y-auto px-2.5 pt-1 pb-3">
        <p className="label-mono px-2 pb-1.5 text-[9.5px]">Console</p>
        <ul className="flex flex-col gap-px">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + "/");
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex h-8 items-center gap-2.5 rounded-[7px] px-2 text-[13.5px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "bg-brand-dim font-medium text-brand-ink"
                      : "text-stone hover:bg-[var(--surface-subtle)] hover:text-ink"
                  )}
                >
                  <Icon size={16} strokeWidth={1.6} aria-hidden="true" />
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
