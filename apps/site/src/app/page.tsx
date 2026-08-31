import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";

export const metadata: Metadata = {
  title: {
    absolute: "Orbien — Gestão que serve. Igreja que cresce.",
  },
  description:
    "Plataforma de gestão para igrejas de pequeno e médio porte. App com identidade da sua igreja sem exigir CNPJ.",
};
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/home/Hero";
import { Credibility } from "@/components/home/Credibility";
import { Pillars } from "@/components/home/Pillars";
import { Modules } from "@/components/home/Modules";
import { SocialProof } from "@/components/home/SocialProof";
import { Comparison } from "@/components/home/Comparison";
import { PricingSection } from "@/components/home/PricingSection";
import { FaqSection } from "@/components/home/FaqSection";
import { FinalCta } from "@/components/home/FinalCta";

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <Hero />
        <Credibility />
        <Pillars />
        <Modules />
        <SocialProof />
        <Comparison />
        <PricingSection />
        <FaqSection />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
