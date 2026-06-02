import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "Página não encontrada",
  description: "A página que você buscou não existe. Volte para a home do Orbien.",
};

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="flex-1 flex items-center justify-center py-24 px-6">
        <div className="text-center max-w-[480px]">
          {/* Error code */}
          <p
            className="font-mono text-[80px] font-medium leading-none mb-6 tracking-[-0.04em]"
            style={{ color: "var(--navy-dim)" }}
          >
            404
          </p>

          <p
            className="font-mono text-[11px] uppercase tracking-[.14em] mb-5"
            style={{ color: "var(--navy-accent)" }}
          >
            Página não encontrada
          </p>

          <h1
            className="font-medium tracking-[-0.025em] mb-4"
            style={{
              fontSize: "clamp(22px, 3.5vw, 32px)",
              lineHeight: 1.15,
              color: "var(--ink)",
            }}
          >
            Esse caminho não existe.
          </h1>

          <p
            className="font-light leading-[1.6] mb-8"
            style={{ fontSize: "16px", color: "var(--stone)" }}
          >
            O link pode ter mudado ou a página foi removida. Use o menu acima ou volte para a home.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-btn bg-navy px-6 text-[15px] font-medium text-white transition-all hover:bg-navy-dark hover:-translate-y-px"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              Voltar para a home
            </Link>
            <Link
              href="/contato"
              className="inline-flex h-12 items-center justify-center rounded-btn border px-6 text-[15px] font-medium transition-all hover:-translate-y-px"
              style={{
                color: "var(--navy-accent)",
                borderColor: "var(--navy-dim)",
              }}
            >
              Falar com a equipe
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
