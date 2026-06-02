import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PrecosHero } from "@/components/precos/PrecosHero";
import { TierTable } from "@/components/precos/TierTable";
import { FeatureCompare } from "@/components/precos/FeatureCompare";
import { Implementation } from "@/components/precos/Implementation";
import { NoCnpjBlock } from "@/components/precos/NoCnpjBlock";
import { PrecosFaq } from "@/components/precos/PrecosFaq";
import { PrecosCta } from "@/components/precos/PrecosCta";

export const metadata: Metadata = {
  title: "Preços",
  description:
    "Dois planos transparentes com preço por faixa de membros. Sem pegadinha por funcionalidade escondida.",
};

export default function PrecosPage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <PrecosHero />
        <TierTable />
        <FeatureCompare />
        <Implementation />
        <NoCnpjBlock />
        <PrecosFaq />
        <PrecosCta />
      </main>
      <Footer />
    </>
  );
}
