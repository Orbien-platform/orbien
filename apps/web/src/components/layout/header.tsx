"use client";

import { usePathname } from "next/navigation";
import { Bell, Menu, Moon, Sun } from "lucide-react";
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
import { Sidebar } from "./sidebar";

const routeLabels: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/pessoas": "Pessoas",
  "/grupos": "Grupos",
  "/financeiro": "Financeiro",
  "/conteudo": "Conteúdo",
  "/voluntarios": "Voluntários",
  "/celebracoes": "Celebrações",
  "/configuracoes": "Configurações",
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
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();

  const currentLabel =
    Object.entries(routeLabels).find(
      ([path]) => pathname === path || pathname.startsWith(path + "/")
    )?.[1] ?? "Dashboard";

  return (
    <header className="flex h-[60px] items-center gap-4 border-b border-[var(--border-default)] bg-[var(--surface-base)] px-4 lg:px-6">
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
        <SheetContent side="left" className="p-0 w-[260px]">
          <Sidebar />
        </SheetContent>
      </Sheet>

      {/* Breadcrumb */}
      <div className="flex-1">
        <span className="text-sm font-medium text-ink dark:text-white">
          {currentLabel}
        </span>
      </div>

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
                <p className="truncate text-xs text-stone">{user.roles[0]}</p>
              </div>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem>Perfil</DropdownMenuItem>
            <DropdownMenuItem>Configurações</DropdownMenuItem>
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
