import Link from "next/link";
import { Reveal } from "@/components/ui/Reveal";
import { CheckIcon } from "@/components/ui/CheckIcon";
import { SectionLabel } from "@/components/ui/SectionLabel";

function CheckBullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 text-sm leading-relaxed" style={{ color: "var(--ink)" }}>
      <CheckIcon className="mt-px" />
      {children}
    </li>
  );
}

const ArrowRight = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
  </svg>
);

export function PricingSection() {
  return (
    <section className="py-20 md:py-24" id="precos">
      <div className="mx-auto max-w-[1180px] px-6">
        <Reveal className="mb-12">
          <SectionLabel className="mb-[18px]">Planos</SectionLabel>
          <h2
            className="font-medium tracking-[-0.025em] mb-3.5"
            style={{ fontSize: "clamp(30px, 4.2vw, 44px)", lineHeight: 1.1, color: "var(--ink)" }}
          >
            Dois planos. O preço cresce com a sua igreja.
          </h2>
          <p className="text-[17px] font-light leading-relaxed max-w-[620px]" style={{ color: "var(--stone)" }}>
            Sem pegadinha por funcionalidade escondida. Você paga pelo plano e pela faixa de membros que sua igreja tem hoje.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Starter */}
          <Reveal>
            <div
              className="relative rounded-[14px] border p-8 flex flex-col gap-5 h-full"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            >
              <div
                className="absolute -top-2.5 left-8 font-mono text-[10px] uppercase tracking-[.1em] px-2.5 py-1 rounded-pill text-white"
                style={{ background: "var(--on-ink)" }}
              >
                Sem CNPJ? Comece aqui.
              </div>
              <div>
                <div
                  className="font-mono text-xs uppercase tracking-[.14em] mb-3"
                  style={{ color: "var(--stone)" }}
                >
                  Starter
                </div>
                <div className="leading-none">
                  <div
                    className="font-mono text-[11px] uppercase tracking-[.08em] mb-1.5"
                    style={{ color: "var(--muted)" }}
                  >
                    A partir de
                  </div>
                  <span
                    className="text-[38px] font-semibold tracking-[-0.03em]"
                    style={{ color: "var(--ink)" }}
                  >
                    R$ 59
                  </span>
                  <span className="text-sm font-normal" style={{ color: "var(--stone)" }}>,90/mês</span>
                </div>
              </div>
              <p className="text-[13.5px] font-light" style={{ color: "var(--stone)" }}>
                Para igrejas de até 300 membros.
              </p>
              <hr style={{ borderColor: "var(--border)" }} />
              <ul className="flex flex-col gap-2.5 flex-1">
                <CheckBullet>App nas lojas com a marca da sua igreja</CheckBullet>
                <CheckBullet>PIX por chave manual</CheckBullet>
                <CheckBullet>Cadastro ilimitado de membros</CheckBullet>
                <CheckBullet>Suporte por email</CheckBullet>
              </ul>
              <Link
                href="/precos"
                className="inline-flex items-center justify-center gap-2 h-11 rounded-btn border text-sm font-medium transition-all"
                style={{
                  color: "var(--navy-accent)",
                  borderColor: "var(--navy-accent)",
                }}
              >
                Ver plano completo <ArrowRight />
              </Link>
            </div>
          </Reveal>

          {/* Premium */}
          <Reveal>
            <div
              className="relative rounded-[14px] border-2 p-8 flex flex-col gap-5 h-full"
              style={{
                background: "var(--surface)",
                borderColor: "#1E3A7B",
                boxShadow: "var(--shadow-md)",
              }}
            >
              <div
                className="absolute -top-2.5 left-8 font-mono text-[10px] uppercase tracking-[.1em] px-2.5 py-1 rounded-pill text-white bg-teal"
              >
                Mais escolhido
              </div>
              <div>
                <div
                  className="font-mono text-xs uppercase tracking-[.14em] mb-3"
                  style={{ color: "var(--stone)" }}
                >
                  Premium
                </div>
                <div className="leading-none">
                  <div
                    className="font-mono text-[11px] uppercase tracking-[.08em] mb-1.5"
                    style={{ color: "var(--muted)" }}
                  >
                    A partir de
                  </div>
                  <span
                    className="text-[38px] font-semibold tracking-[-0.03em]"
                    style={{ color: "var(--ink)" }}
                  >
                    R$ 99
                  </span>
                  <span className="text-sm font-normal" style={{ color: "var(--stone)" }}>,90/mês</span>
                </div>
              </div>
              <p className="text-[13.5px] font-light" style={{ color: "var(--stone)" }}>
                Para igrejas que querem app próprio.
              </p>
              <hr style={{ borderColor: "var(--border)" }} />
              <ul className="flex flex-col gap-2.5 flex-1">
                <CheckBullet>App próprio nas lojas + domínio</CheckBullet>
                <CheckBullet>PIX dinâmico com recibo automático</CheckBullet>
                <CheckBullet>Forecast, DRE e exportação contábil</CheckBullet>
                <CheckBullet>Suporte WhatsApp + treinamento incluso</CheckBullet>
              </ul>
              <Link
                href="/precos"
                className="inline-flex items-center justify-center gap-2 h-11 rounded-btn bg-navy text-sm font-medium text-white transition-all hover:bg-navy-dark"
              >
                Ver plano completo <ArrowRight />
              </Link>
            </div>
          </Reveal>
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/precos"
            className="inline-flex items-center text-sm font-medium transition-colors"
            style={{ color: "var(--stone)" }}
          >
            Ver tabela completa de preços →
          </Link>
        </div>
      </div>
    </section>
  );
}
