"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import axios from "axios";
import { ChevronRight, Menu, Moon, Sun } from "lucide-react";
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
import { findNavEntry, navLabel } from "@/lib/navigation";
import { useChurchIdentity } from "@/contexts/ChurchIdentityContext";
import { Sidebar } from "./sidebar";
import { CommandPalette } from "./CommandPalette";

/** Andamento do "Trocar senha" no menu da conta. */
type PasswordLinkState = "idle" | "sending" | "sent" | "error";

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
  const [passwordLink, setPasswordLink] = useState<PasswordLinkState>("idle");

  // Não há `change-password` na API: "Trocar senha" pede o mesmo e-mail de
  // redefinição do "Esqueci a senha", para o endereço da própria conta. A API
  // responde 200 de qualquer jeito (não revela se o e-mail existe).
  // O item só é desenhado com e-mail e fica desabilitado enquanto envia, então
  // a função não precisa se proteger de nenhum dos dois.
  async function sendPasswordLink(email: string) {
    setPasswordLink("sending");
    try {
      await axios.post("/api-proxy/auth/forgot-password", {
        email: email.trim().toLowerCase(),
      });
      setPasswordLink("sent");
    } catch {
      setPasswordLink("error");
    }
  }

  const { groupTerm } = useChurchIdentity();
  const entry = findNavEntry(pathname);
  const crumbs: string[] = entry
    ? [entry.section, navLabel(entry.item, groupTerm.plural)].filter(
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
        <CommandPalette />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Alternar tema"
        >
          <Sun size={20} strokeWidth={1.5} className="block dark:hidden" />
          <Moon size={20} strokeWidth={1.5} className="hidden dark:block" />
        </Button>

        <DropdownMenu
          onOpenChange={(open) => {
            if (!open) setPasswordLink("idle");
          }}
        >
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
          <DropdownMenuContent align="end" className="w-64">
            {user && (
              <div className="px-2 py-1.5">
                <p className="truncate text-sm font-medium text-ink dark:text-white">
                  {user.name}
                </p>
                <p className="truncate text-xs text-stone">{user.email}</p>
                <p className="truncate text-xs text-muted-text">
                  {user.roles[0] ? roleLabel(user.roles[0]) : ""}
                </p>
              </div>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/perfil")}>
              Perfil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/configuracoes")}>
              Configurações
            </DropdownMenuItem>
            {user?.email && (
              <DropdownMenuItem
                closeOnClick={false}
                disabled={passwordLink === "sending"}
                onClick={() => sendPasswordLink(user.email)}
              >
                Trocar senha
              </DropdownMenuItem>
            )}
            {passwordLink !== "idle" && (
              <p
                role="status"
                className={
                  passwordLink === "error"
                    ? "px-2 pb-1.5 text-xs text-crimson"
                    : "px-2 pb-1.5 text-xs text-stone"
                }
              >
                {passwordLink === "sending" && "Enviando o link…"}
                {passwordLink === "sent" && `Enviamos o link para ${user?.email}.`}
                {passwordLink === "error" && "Não foi possível enviar o link. Tente de novo."}
              </p>
            )}
            <DropdownMenuSeparator />
            <p className="px-2 py-1.5 text-xs text-muted-text">
              Escalas e perfil pessoal ficam no app.
            </p>
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
