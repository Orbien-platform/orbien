"use client";

import { UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { roleLabel } from "@/lib/roles";

/**
 * Perfil de quem está logado.
 *
 * Só leitura, e só do que a sessão já traz (`/api/session`): a API não tem
 * rota para o usuário editar os próprios dados.
 */

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-stone">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-ink dark:text-white">{children}</dd>
    </div>
  );
}

export default function PerfilPage() {
  const { user, isLoading } = useAuth();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-medium text-ink dark:text-white">Perfil</h1>
        <p className="mt-0.5 text-sm text-stone">Seus dados de acesso</p>
      </div>

      {isLoading ? (
        <Skeleton className="h-44 w-full rounded-[12px]" />
      ) : !user ? (
        <p className="py-10 text-center text-sm text-crimson">
          Não foi possível carregar a sessão. Entre novamente.
        </p>
      ) : (
        <section className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)] p-5">
          <div className="mb-5 flex items-center gap-4">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="bg-navy text-base font-medium text-white">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-base font-medium text-ink dark:text-white">
                {user.name}
              </p>
              <p className="truncate text-sm text-stone">{user.email}</p>
            </div>
          </div>

          <div className="mb-4 flex items-center gap-2">
            <UserRound size={16} strokeWidth={1.5} className="text-navy" />
            <h2 className="text-sm font-medium text-ink dark:text-white">Acesso</h2>
          </div>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nome">{user.name}</Field>
            <Field label="E-mail">{user.email}</Field>
            <Field label={user.roles.length > 1 ? "Papéis" : "Papel"}>
              {user.roles.length > 0 ? user.roles.map(roleLabel).join(", ") : "—"}
            </Field>
          </dl>

          <p className="mt-5 text-xs text-stone">
            Para alterar nome ou e-mail, fale com o administrador da sua igreja.
          </p>
        </section>
      )}
    </div>
  );
}
