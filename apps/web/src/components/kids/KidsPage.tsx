"use client";

import type { ReactNode } from "react";
import { KidsNav } from "@/components/kids/KidsNav";
import { PremiumInvite } from "@/components/ui/PremiumInvite";
import { useAuth } from "@/hooks/useAuth";
import { isUpgradeRoute } from "@/lib/permissions";

/** Papéis que gerenciam o Kids (iguais a `KIDS_MANAGE_ROLES` da API). */
export const KIDS_MANAGE_ROLES = ["tenant_admin", "admin_congregation", "pastor", "secretary", "ministry_leader"];

/**
 * Moldura das telas do Kids. Kids é Premium: numa igreja Starter, quem
 * alcançaria a área no Premium vê o convite no lugar da tela, sem pedir à API o
 * dado que viria 403.
 */
export function KidsPage({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: (ctx: { canManage: boolean }) => ReactNode;
}) {
  const { user } = useAuth();
  if (isUpgradeRoute(user, "/kids")) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="page-title">Kids</h1>
        <PremiumInvite
          resource="Kids"
          description="Abra as turmas de cada culto, receba as crianças com um código de retirada e devolva cada uma só a quem o código confere."
        />
      </div>
    );
  }
  const canManage = (user?.roles ?? []).some((r) => KIDS_MANAGE_ROLES.includes(r));
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="text-sm text-stone">{subtitle}</p> : null}
      </div>
      <KidsNav />
      {children({ canManage })}
    </div>
  );
}
