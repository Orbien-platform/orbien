import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ContatoContent } from "@/components/contato/ContatoContent";

export const metadata: Metadata = {
  title: "Contato",
  description:
    "Fale diretamente com a equipe Orbien pelo WhatsApp. Atendimento de segunda a sexta, 9h às 18h. Passo Fundo, RS.",
};

export default function ContatoPage() {
  return (
    <>
      <Header />
      <main className="flex-1 flex flex-col">
        <ContatoContent />
      </main>
      <Footer />
    </>
  );
}
