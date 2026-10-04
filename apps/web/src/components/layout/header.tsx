"use client";

import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronRight, Menu, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { roleLabel } from "@/lib/roles";
import { findNavEntry } from "@/lib/navigation";
import { Sidebar } from "./sidebar";

/** Telas fora do menu lateral — hoje só o perfil, que mora no menu da conta. */
const OFF_MENU_LABELS: Record<string, string> = {
  "/perfil": "Perfil",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();

  const entry = findNavEntry(pathname);
  const crumbs: string[] = entry
    ? [entry.section, entry.item.label].filter(
        // Seção com o mesmo nome da tela ("Pessoas › Pessoas") vira um passo só.
        (c, i, all): c is string => !!c && all.indexOf(c) === i
      )
    : [OFF_MENU_LABELS[pathname] ?? "Início"];

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-[var(--border-default)] bg-[var(--surface-base)] px-4 lg:px-6">
      {/* Mobile sidebar drawer */}
      <Sheet>
        <SheetTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Abrir menu"
            />
          }
        >
          <Menu size={20} strokeWidth={1.5} />
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-[236px]">
          <Sidebar />
        </SheetContent>
      </Sheet>

      {/* Caminho: seção › tela */}
      <nav aria-label="Você está em" className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px]">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <span key={i} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <ChevronRight size={13} aria-hidden="true" className="shrink-0 text-muted-text" />}
              <span
                aria-current={last ? "page" : undefined}
                className={last ? "truncate font-medium text-ink" : "text-muted-text"}
              >
                {crumb}
              </span>
            </span>
          );
        })}
      </nav>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Alternar tema"
        >
          <Sun size={20} strokeWidth={1.5} className="block dark:hidden" />
          <Moon size={20} strokeWidth={1.5} className="hidden dark:block" />
        </Button>

        <Button variant="ghost" size="icon" aria-label="Notificações">
          <Bell size={20} strokeWidth={1.5} />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                className="h-9 w-9 rounded-full p-0"
                aria-label="Menu do usuário"
              />
            }
          >
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-navy text-white text-xs font-medium">
                {user ? getInitials(user.name) : "??"}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {user && (
              <div className="px-2 py-1.5">
                <p className="truncate text-sm font-medium text-ink dark:text-white">
                  {user.name}
                </p>
                <p className="truncate text-xs text-stone">{user.roles[0] ? roleLabel(user.roles[0]) : ""}</p>
              </div>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/perfil")}>
              Perfil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/configuracoes")}>
              Configurações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              data-variant="destructive"
              className="text-crimson"
              onClick={logout}
            >
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
