"use client";

import { ChildrenPanel } from "@/components/kids/ChildrenPanel";
import { KidsPage } from "@/components/kids/KidsPage";

export default function KidsCriancasPage() {
  return (
    <KidsPage title="Kids" subtitle="Crianças, responsáveis autorizados e consentimento.">
      {({ canManage }) => <ChildrenPanel canManage={canManage} />}
    </KidsPage>
  );
}
