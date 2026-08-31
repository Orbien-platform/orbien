import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { SobreHero } from "@/components/sobre/SobreHero";
import { PorQueExistimos } from "@/components/sobre/PorQueExistimos";
import { PrincipiosSection } from "@/components/sobre/PrincipiosSection";
import { EstagioAtual } from "@/components/sobre/EstagioAtual";
import { FinalCta } from "@/components/home/FinalCta";

export const metadata: Metadata = {
  title: "Sobre",
  description:
    "O Orbien existe para dar às igrejas de pequeno e médio porte uma plataforma moderna e acessível — construída com pastores, para pastores. Fase piloto · Passo Fundo, RS.",
};

export default function SobrePage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <SobreHero />
        <PorQueExistimos />
        <PrincipiosSection />
        <EstagioAtual />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
