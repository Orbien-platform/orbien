"use client";

import { usePathname } from "next/navigation";
import { LogOut, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useAuth } from "@/hooks/useAuth";
import { navItems } from "./sidebar";

export function Header() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();

  const currentLabel =
    navItems.find(
      ({ href }) => pathname === href || pathname.startsWith(href + "/")
    )?.label ?? "Plataforma";

  return (
    <header className="flex h-[60px] items-center gap-4 border-b border-[var(--border-default)] bg-[var(--surface-base)] px-4 lg:px-6">
      <div className="flex-1">
        <span className="text-sm font-medium text-ink dark:text-white">
          {currentLabel}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {user && (
          <span className="hidden truncate text-xs text-stone sm:block">
            {user.email}
          </span>
        )}

        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Alternar tema"
          className="flex h-9 w-9 items-center justify-center rounded-[8px] text-stone transition-colors hover:bg-[var(--surface-subtle)] hover:text-ink dark:hover:text-white"
        >
          <Sun size={18} strokeWidth={1.5} className="block dark:hidden" />
          <Moon size={18} strokeWidth={1.5} className="hidden dark:block" />
        </button>

        <button
          type="button"
          onClick={logout}
          aria-label="Sair"
          className="flex h-9 w-9 items-center justify-center rounded-[8px] text-stone transition-colors hover:bg-[var(--surface-subtle)] hover:text-crimson"
        >
          <LogOut size={18} strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
}
