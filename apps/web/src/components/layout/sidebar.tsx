"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  UsersRound,
  Wallet,
  Megaphone,
  CalendarDays,
  Church,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { canAccessRoute } from "@/lib/permissions";
import { useAuth } from "@/hooks/useAuth";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pessoas", label: "Pessoas", icon: Users },
  { href: "/grupos", label: "Grupos", icon: UsersRound },
  { href: "/financeiro", label: "Financeiro", icon: Wallet },
  { href: "/conteudo", label: "Conteúdo", icon: Megaphone },
  { href: "/voluntarios", label: "Voluntários", icon: CalendarDays },
  { href: "/celebracoes", label: "Celebrações", icon: Church },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

interface SidebarProps {
  congregationName?: string;
}

export function Sidebar({ congregationName = "Doca Church" }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();

  // Link que só levaria a um 403 não é desenhado. Isto é conveniência, não
  // controle de acesso: quem digitar a URL chega à tela e recebe de lá o
  // "sem acesso" — a autoridade continua sendo o `@Roles` da API.
  const visibleItems = navItems.filter(({ href }) => canAccessRoute(user, href));

  return (
    <aside className="flex h-full w-[260px] flex-col border-r border-[var(--border-default)] bg-[var(--surface-base)] dark:bg-[var(--surface-base)]">
      {/* Logo */}
      <div className="flex flex-col gap-0.5 px-6 py-5 border-b border-[var(--border-default)]">
        <span className="font-sans text-xl font-medium tracking-tight text-navy">
          orbien
        </span>
        <span className="text-xs font-normal text-stone">{congregationName}</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-0.5">
          {visibleItems.map(({ href, label, icon: Icon }) => {
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
