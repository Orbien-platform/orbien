import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { SemCnpjHero } from "@/components/sem-cnpj/SemCnpjHero";
import { HowItWorks } from "@/components/sem-cnpj/HowItWorks";
import { PixFlow } from "@/components/sem-cnpj/PixFlow";
import { StarterIncludes } from "@/components/sem-cnpj/StarterIncludes";
import { UpgradePath } from "@/components/sem-cnpj/UpgradePath";
import { SemCnpjFaq } from "@/components/sem-cnpj/SemCnpjFaq";
import { FinalCta } from "@/components/home/FinalCta";

export const metadata: Metadata = {
  title: "Sem CNPJ — Orbien",
  description:
    "Sua igreja não tem CNPJ? O Starter foi feito pra você. PIX direto na sua chave, sem intermediário. Migração pro Premium em 15 minutos quando formalizar.",
};

export default function SemCnpjPage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <SemCnpjHero />
        <HowItWorks />
        <PixFlow />
        <StarterIncludes />
        <UpgradePath />
        <SemCnpjFaq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
