import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { FuncionalizadesHub } from "@/components/funcionalidades/FuncionalizadesHub";
import { FinalCta } from "@/components/home/FinalCta";

export const metadata: Metadata = {
  title: "Funcionalidades",
  description:
    "Quatro módulos que cobrem o que sua igreja faz toda semana: membros, financeiro, pequenos grupos e conteúdos. Uma plataforma integrada.",
};

export default function FuncionalizadesPage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <FuncionalizadesHub />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
