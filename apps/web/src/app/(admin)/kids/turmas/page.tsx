"use client";

import { KidsPage } from "@/components/kids/KidsPage";
import { RoomsPanel } from "@/components/kids/RoomsPanel";

export default function KidsTurmasPage() {
  return (
    <KidsPage title="Kids" subtitle="Turmas da congregação, cada uma com a sua faixa etária.">
      {({ canManage }) => <RoomsPanel canManage={canManage} />}
    </KidsPage>
  );
}
