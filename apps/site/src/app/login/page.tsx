import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "Entrar",
  description: "O acesso ao painel Orbien abrirá em breve. Entre na lista de espera para ser avisado.",
};

export default function LoginPage() {
  return (
    <>
      <Header />
      <main className="flex-1 flex items-center justify-center py-24 px-6">
        <div className="text-center max-w-[480px]">
          {/* Brandmark */}
          <div className="flex justify-center mb-8">
            <span
              className="w-14 h-14 flex items-center justify-center rounded-[16px]"
              style={{ background: "var(--navy-tint)", color: "var(--navy-accent)" }}
            >
              <svg width="28" height="28" viewBox="0 0 22 22" fill="none">
                <ellipse cx="11" cy="11" rx="9" ry="4" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="11" cy="11" r="3" fill="currentColor" />
                <circle cx="20" cy="11" r="2" fill="#00B8A2" />
              </svg>
            </span>
          </div>

          <p
            className="font-mono text-[11px] uppercase tracking-[.14em] mb-5"
            style={{ color: "var(--navy-accent)" }}
          >
            Em breve
          </p>

          <h1
            className="font-medium tracking-[-0.025em] mb-4"
            style={{ fontSize: "clamp(26px, 4vw, 36px)", lineHeight: 1.1, color: "var(--ink)" }}
          >
            O acesso vai abrir em breve.
          </h1>

          <p
            className="font-light leading-[1.6] mb-8"
            style={{ fontSize: "16px", color: "var(--stone)" }}
          >
            O painel Orbien ainda está em fase piloto. Entre na lista de espera e a gente avisa quando a sua leva abrir.
          </p>

          {/* TODO: connect to real waitlist action */}
          <a
            href="#waitlist"
            className="inline-flex h-12 items-center gap-2 rounded-btn bg-navy px-6 text-[15px] font-medium text-white transition-all hover:bg-navy-dark hover:-translate-y-px"
          >
            Entrar na lista de espera
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
            </svg>
          </a>

          <p className="mt-6 text-[13px] font-light" style={{ color: "var(--muted)" }}>
            Já está no piloto?{" "}
            <a
              href="https://wa.me/5554999529683"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 transition-colors hover:text-[var(--ink)]"
              style={{ color: "var(--stone)" }}
            >
              Fale no WhatsApp
            </a>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
