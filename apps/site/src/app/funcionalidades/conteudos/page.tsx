import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ConteudosHero } from "@/components/funcionalidades/conteudos/ConteudosHero";
import { TiposConteudo } from "@/components/funcionalidades/conteudos/TiposConteudo";
import { ConteudosCapabilities } from "@/components/funcionalidades/conteudos/ConteudosCapabilities";
import { AlcanceSection } from "@/components/funcionalidades/conteudos/AlcanceSection";
import { ConteudosFaq } from "@/components/funcionalidades/conteudos/ConteudosFaq";
import { FinalCta } from "@/components/home/FinalCta";

export const metadata: Metadata = {
  title: "Conteúdos e Notificações — Orbien",
  description:
    "Avisos, devocionais diários e pedidos de oração no app com a identidade da sua igreja. O membro se sente conectado todos os dias — não só no domingo.",
};

export default function ConteudosPage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <ConteudosHero />
        <TiposConteudo />
        <ConteudosCapabilities />
        <AlcanceSection />
        <ConteudosFaq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
