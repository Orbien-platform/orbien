import Link from "next/link";
import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { FaqItem } from "@/components/ui/FaqItem";

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
          <SectionLabel className="mb-[18px]">FAQ</SectionLabel>
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
              <FaqItem q={q} a={a} />
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
