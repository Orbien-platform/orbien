import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PequenosGruposHero } from "@/components/funcionalidades/pequenos-grupos/PequenosGruposHero";
import { SemaforoSaude } from "@/components/funcionalidades/pequenos-grupos/SemaforoSaude";
import { PGCapabilities } from "@/components/funcionalidades/pequenos-grupos/PGCapabilities";
import { LiderMobile } from "@/components/funcionalidades/pequenos-grupos/LiderMobile";
import { PGFaq } from "@/components/funcionalidades/pequenos-grupos/PGFaq";
import { FinalCta } from "@/components/home/FinalCta";

export const metadata: Metadata = {
  title: "Pequenos Grupos",
  description:
    "Materiais agendados, semáforo de saúde e registro de presença pelo celular. O pastor sabe qual célula está esfriando — sem perguntar para cada líder.",
};

export default function PequenosGruposPage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <PequenosGruposHero />
        <SemaforoSaude />
        <PGCapabilities />
        <LiderMobile />
        <PGFaq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
