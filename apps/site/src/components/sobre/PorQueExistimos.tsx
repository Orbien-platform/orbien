import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { CheckIcon } from "@/components/ui/CheckIcon";

const PROBLEMAS = [
  {
    titulo: "Caro demais para quem está começando",
    desc: "As plataformas líderes cobram por funcionalidade, por membro cadastrado ou por módulo. Uma igreja de 80 membros acaba pagando o mesmo que uma de 800.",
  },
  {
    titulo: "Interface que afasta, não que ajuda",
    desc: "A maioria dos sistemas foi desenhada na era do desktop. A secretária usa no celular, o pastor usa no celular — mas a interface ainda exige treinamento de dois dias.",
  },
  {
    titulo: "Exige CNPJ onde não devia",
    desc: "Igrejas em formação — algumas delas com 10 anos de existência — ficam reféns da burocracia fiscal para ter acesso ao que já é básico: PIX organizado e app próprio.",
  },
] as const;

const RESPOSTAS = [
  "Planos por faixa de membros — preço proporcional à realidade da sua igreja",
  "Interface mobile-first, desenhada com quem vai usar todo dia",
  "Starter sem CNPJ, com PIX direto na chave da igreja desde o primeiro dia",
  "Migração para o Premium em 15 minutos quando formalizar",
] as const;

export function PorQueExistimos() {
  return (
    <section className="py-20 md:py-24 border-t" style={{ borderColor: "var(--border)" }}>
      <div className="mx-auto max-w-[1180px] px-6">
        <div className="grid grid-cols-1 gap-14 md:grid-cols-2 md:gap-20">

          {/* Left — O problema */}
          <Reveal>
            <SectionLabel className="mb-[18px]">O problema</SectionLabel>
            <h2
              className="font-medium tracking-[-0.025em] mb-8"
              style={{ fontSize: "clamp(26px, 3.4vw, 38px)", lineHeight: 1.1, color: "var(--ink)" }}
            >
              O mercado ignorou igrejas pequenas por tempo demais.
            </h2>

            <div className="flex flex-col gap-6">
              {PROBLEMAS.map(({ titulo, desc }) => (
                <div key={titulo} className="flex gap-4">
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: "var(--crimson-dim)", color: "var(--color-crimson)" }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#C0392B" strokeWidth="3" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </span>
                  <div>
                    <p className="text-[14.5px] font-semibold mb-1" style={{ color: "var(--ink)" }}>{titulo}</p>
                    <p className="text-[13.5px] font-light leading-relaxed" style={{ color: "var(--stone)" }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

          {/* Right — Nossa resposta */}
          <Reveal>
            <SectionLabel className="mb-[18px]">Nossa resposta</SectionLabel>
            <h2
              className="font-medium tracking-[-0.025em] mb-6"
              style={{ fontSize: "clamp(26px, 3.4vw, 38px)", lineHeight: 1.1, color: "var(--ink)" }}
            >
              Uma plataforma que começa pequena e cresce junto.
            </h2>

            <p className="text-[15px] font-light leading-[1.65] mb-8" style={{ color: "var(--stone)" }}>
              A plataforma de gestão para igrejas que ainda não precisam de um sistema complexo — mas já merecem um bonito. Quatro módulos que cobrem o dia a dia, preço por faixa de membros e uma experiência que qualquer secretária aprende em uma tarde.
            </p>

            <div className="flex flex-col gap-3.5">
              {RESPOSTAS.map((r) => (
                <div key={r} className="flex items-start gap-3">
                  <span className="mt-0.5 flex-shrink-0">
                    <CheckIcon />
                  </span>
                  <span className="text-[14px] font-light" style={{ color: "var(--stone)" }}>{r}</span>
                </div>
              ))}
            </div>
          </Reveal>

        </div>
      </div>
    </section>
  );
}
