import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { LgpdContent } from "@/components/lgpd/LgpdContent";

export const metadata: Metadata = {
  title: "Política de Privacidade e LGPD",
  description:
    "Como a Orbien coleta, usa e protege dados pessoais conforme a LGPD. Encarregado de Dados, direitos dos titulares e contato para solicitações.",
};

export default function LgpdPage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <LgpdContent />
      </main>
      <Footer />
    </>
  );
}
