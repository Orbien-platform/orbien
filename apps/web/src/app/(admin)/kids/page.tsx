"use client";

import { Counter } from "@/components/kids/Counter";
import { KidsPage } from "@/components/kids/KidsPage";

export default function KidsBalcaoPage() {
  return (
    <KidsPage title="Kids" subtitle="Check-in e entrega das crianças nos cultos de hoje.">
      {({ canManage }) => <Counter canManage={canManage} />}
    </KidsPage>
  );
}
