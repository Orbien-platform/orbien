import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { MembrosHero } from "@/components/funcionalidades/membros/MembrosHero";
import { MemberLifecycle } from "@/components/funcionalidades/membros/MemberLifecycle";
import { MembrosCapabilities } from "@/components/funcionalidades/membros/MembrosCapabilities";
import { PresencaPanel } from "@/components/funcionalidades/membros/PresencaPanel";
import { MembrosFaq } from "@/components/funcionalidades/membros/MembrosFaq";
import { FinalCta } from "@/components/home/FinalCta";

export const metadata: Metadata = {
  title: "Membros e Visitantes — Orbien",
  description:
    "Cadastre visitantes em 30 segundos pelo QR code, acompanhe o ciclo de vida completo e nunca perca um visitante de vista. Módulo de membros da Orbien.",
};

export default function MembrosPage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <MembrosHero />
        <MemberLifecycle />
        <MembrosCapabilities />
        <PresencaPanel />
        <MembrosFaq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
