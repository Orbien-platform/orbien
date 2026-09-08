"use client";

import { useAuth } from "@/hooks/useAuth";
import { SongCatalogPanel } from "@/components/repertorio/SongCatalogPanel";

export default function RepertorioPage() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const canEdit = roles.some((r) =>
    ["admin_congregation", "pastor", "tenant_admin", "ministry_leader"].includes(r)
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-medium text-ink dark:text-white">Repertório</h1>
      </div>

      <SongCatalogPanel canEdit={canEdit} />
    </div>
  );
}
