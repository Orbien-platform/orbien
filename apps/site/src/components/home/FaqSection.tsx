import Link from "next/link";
import { Reveal } from "@/components/ui/Reveal";

const FAQS = [
  {
    q: "A Orbien funciona pra qualquer denominação?",
    a: "Sim. O produto é confessional-neutro: batista, assembleia, presbiteriana, carismática, católica, qualquer tradição. A terminologia (célula, pequeno grupo, EBD, ministério) é configurável pela igreja.",
  },
  {
    q: "Preciso ter CNPJ pra usar?",
    a: "Não. O Starter foi feito pra igrejas sem CNPJ — a doação por PIX cai direto na chave da igreja, sem passar pela Orbien. Quando a igreja formalizar, a migração pro Premium leva 15 minutos.",
  },
  {
    q: "Tem trial gratuito?",
    a: "Sim, 14 dias do Premium pra você ver tudo. Depois você escolhe entre Starter e Premium ou cancela sem custo.",
  },
  {
    q: "Onde os dados ficam guardados?",
    a: "Em servidores no Brasil (São Paulo), em conformidade com a LGPD. A igreja é controladora dos dados, a Orbien é operadora.",
  },
] as const;

export function FaqSection() {
  return (
    <section className="py-20 md:py-24" id="faq">
      <div className="mx-auto max-w-[1180px] px-6">
        <Reveal className="mb-12">
          <p
            className="inline-flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[.14em] mb-[18px]"
            style={{ color: "var(--navy-accent)" }}
          >
            <span className="w-6 h-px" style={{ background: "var(--navy-accent)" }} />
            FAQ
          </p>
          <h2
            className="font-medium tracking-[-0.025em]"
            style={{ fontSize: "clamp(30px, 4.2vw, 44px)", lineHeight: 1.1, color: "var(--ink)" }}
          >
            Perguntas que a gente sempre ouve.
          </h2>
        </Reveal>

        <div className="flex flex-col gap-2 max-w-[820px]">
          {FAQS.map(({ q, a }) => (
            <Reveal key={q}>
              <details
                className="faq-details rounded-modal border overflow-hidden transition-colors"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                <summary
                  className="flex items-center justify-between gap-4 px-6 py-[22px] cursor-pointer text-base font-medium tracking-[-0.01em] list-none hover:bg-[var(--bg)] transition-colors"
                  style={{ color: "var(--ink)" }}
                >
                  {q}
                  <span
                    className="faq-icon w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200"
                    style={{ background: "var(--navy-tint)", color: "var(--navy-accent)" }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </span>
                </summary>
                <div
                  className="px-6 pb-6 text-[14.5px] font-light leading-relaxed max-w-[680px]"
                  style={{ color: "var(--stone)" }}
                >
                  {a}
                </div>
              </details>
            </Reveal>
          ))}
        </div>

        <div className="mt-6">
          <Link
            href="/precos#faq"
            className="inline-flex items-center text-sm font-medium transition-colors"
            style={{ color: "var(--stone)" }}
          >
            Ver todas as perguntas →
          </Link>
        </div>
      </div>
    </section>
  );
}
