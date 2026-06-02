import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { FinanceiroHero } from "@/components/funcionalidades/financeiro/FinanceiroHero";
import { PixCenarios } from "@/components/funcionalidades/financeiro/PixCenarios";
import { FinanceiroCapabilities } from "@/components/funcionalidades/financeiro/FinanceiroCapabilities";
import { RelatorioSemanal } from "@/components/funcionalidades/financeiro/RelatorioSemanal";
import { FinanceiroFaq } from "@/components/funcionalidades/financeiro/FinanceiroFaq";
import { FinalCta } from "@/components/home/FinalCta";

export const metadata: Metadata = {
  title: "Financeiro",
  description:
    "PIX com recibo automático, dízimo recorrente, relatório semanal e exportação contábil. Gestão financeira completa para igrejas — do Starter ao Premium.",
};

export default function FinanceiroPage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <FinanceiroHero />
        <PixCenarios />
        <FinanceiroCapabilities />
        <RelatorioSemanal />
        <FinanceiroFaq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
