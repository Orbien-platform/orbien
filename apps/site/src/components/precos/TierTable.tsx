import React from "react";
import { Reveal } from "@/components/ui/Reveal";

type Tier = {
  range: string;
  sub: string;
  starter: string | null;
  premium: string;
};

const TIERS: Tier[] = [
  { range: "Até 50 membros",  sub: "igrejas em formação",             starter: "59,90",  premium: "99,90"  },
  { range: "51 a 150",        sub: "perfil mais comum",               starter: "89,90",  premium: "159,90" },
  { range: "151 a 300",       sub: "igrejas estabelecidas",           starter: "159,90", premium: "249,00" },
  { range: "301 a 600",       sub: "multissite começando",            starter: null,     premium: "349,00" },
  { range: "Acima de 600",    sub: "plano sob medida a partir de 500", starter: null,    premium: "499,00" },
];

const NOTES = [
  "Starter não está disponível acima de 300 membros.",
  "10% de desconto no primeiro ano do Premium.",
  "Filial adicional: R$ 49,90 (Starter) / R$ 79,90 (Premium) por mês.",
];

function Price({ value }: { value: string | null }) {
  if (!value) {
    return <span className="font-light text-lg" style={{ color: "var(--muted)" }}>—</span>;
  }
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-sm font-normal" style={{ fontFamily: "var(--font-sans)", color: "var(--stone)" }}>R$</span>
      <span className="font-mono font-medium text-lg tracking-[-0.01em]" style={{ color: "var(--ink)" }}>{value}</span>
      <span className="text-xs font-normal" style={{ fontFamily: "var(--font-sans)", color: "var(--muted)" }}>/mês</span>
    </span>
  );
}

export function TierTable() {
  return (
    <section className="pb-20 md:pb-24" id="faixas">
      <div className="mx-auto max-w-[1180px] px-6">
        <Reveal className="mb-12">
          <p
            className="inline-flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[.14em] mb-[18px]"
            style={{ color: "var(--navy-accent)" }}
          >
            <span className="w-6 h-px" style={{ background: "var(--navy-accent)" }} />
            A tabela
          </p>
          <h2
            className="font-medium tracking-[-0.025em] mb-3.5"
            style={{ fontSize: "clamp(28px, 3.6vw, 40px)", lineHeight: 1.1, color: "var(--ink)" }}
          >
            Preço por faixa de membros
          </h2>
          <p className="text-base font-light leading-relaxed max-w-[620px]" style={{ color: "var(--stone)" }}>
            Em 10 segundos: encontre sua faixa, veja o valor. Sem assistente, sem cotação.
          </p>
        </Reveal>

        {/* ── Desktop table ── */}
        <Reveal className="hidden md:block">
          <div
            className="rounded-modal border overflow-hidden"
            style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-md)" }}
          >
            {/* Column grid: [faixa | starter | premium] */}
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr" }}>
              {/* Header */}
              <div
                className="px-7 py-[22px] flex items-center border-b"
                style={{ background: "var(--subtle)", borderColor: "var(--border-strong)" }}
              >
                <span className="font-mono text-[11px] uppercase tracking-[.14em]" style={{ color: "var(--stone)" }}>
                  Faixa de membros
                </span>
              </div>
              <div
                className="px-7 py-[22px] flex items-center border-b border-l"
                style={{ background: "var(--subtle)", borderColor: "var(--border-strong)" }}
              >
                <span className="text-lg font-semibold tracking-[-0.01em]" style={{ color: "var(--ink)" }}>
                  Starter
                </span>
              </div>
              <div
                className="px-7 py-[22px] flex items-center gap-2.5 border-b border-l"
                style={{ background: "var(--navy-soft)", borderColor: "var(--border-strong)" }}
              >
                <span className="text-lg font-semibold tracking-[-0.01em]" style={{ color: "var(--ink)" }}>
                  Premium
                </span>
                <span
                  className="font-mono text-[9px] px-2 py-0.5 rounded-pill tracking-[.08em] font-medium"
                  style={{ background: "var(--teal-dim)", color: "#00B8A2" }}
                >
                  Mais escolhido
                </span>
              </div>

              {/* Data rows */}
              {TIERS.map(({ range, sub, starter, premium }, i) => {
                const isLast = i === TIERS.length - 1;
                const border = isLast ? "" : "border-b";
                return (
                  <React.Fragment key={i}>
                    <div
                      className={`px-7 py-[22px] flex items-center ${border}`}
                      style={{ borderColor: "var(--border)" }}
                    >
                      <div>
                        <div className="text-[15px] font-medium" style={{ color: "var(--ink)" }}>{range}</div>
                        <div className="font-mono text-[12.5px] mt-0.5 lowercase tracking-[.04em]" style={{ color: "var(--muted)" }}>{sub}</div>
                      </div>
                    </div>
                    <div
                      className={`px-7 py-[22px] flex items-center border-l ${border}`}
                      style={{ borderColor: "var(--border)" }}
                    >
                      <Price value={starter} />
                    </div>
                    <div
                      className={`px-7 py-[22px] flex items-center border-l ${border}`}
                      style={{ background: "var(--navy-soft)", borderColor: "var(--border)" }}
                    >
                      <Price value={premium} />
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </Reveal>

        {/* ── Mobile cards ── */}
        <Reveal className="md:hidden">
          <div className="flex flex-col gap-4">
            {/* Starter card */}
            <div
              className="rounded-[14px] border overflow-hidden"
              style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-sm)" }}
            >
              <div
                className="px-[22px] py-5 border-b flex items-baseline gap-2.5"
                style={{ borderColor: "var(--border)" }}
              >
                <span className="text-lg font-semibold tracking-[-0.01em]" style={{ color: "var(--ink)" }}>Starter</span>
              </div>
              {TIERS.map(({ range, sub, starter }, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 px-[22px] py-3.5 border-b last:border-0"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div>
                    <div className="text-[14.5px] font-medium" style={{ color: "var(--ink)" }}>{range}</div>
                    {sub && <div className="font-mono text-[11.5px] mt-0.5" style={{ color: "var(--muted)" }}>{sub}</div>}
                  </div>
                  <Price value={starter} />
                </div>
              ))}
            </div>

            {/* Premium card */}
            <div
              className="rounded-[14px] border overflow-hidden"
              style={{
                background: `linear-gradient(180deg, var(--navy-soft), var(--surface) 30%)`,
                borderColor: "var(--border-strong)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div
                className="px-[22px] py-5 border-b flex items-baseline gap-2.5"
                style={{ borderColor: "var(--border)" }}
              >
                <span className="text-lg font-semibold tracking-[-0.01em]" style={{ color: "var(--ink)" }}>Premium</span>
                <span
                  className="font-mono text-[9px] px-2 py-0.5 rounded-pill tracking-[.08em] font-medium"
                  style={{ background: "var(--teal-dim)", color: "#00B8A2" }}
                >
                  Mais escolhido
                </span>
              </div>
              {TIERS.map(({ range, sub, premium }, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 px-[22px] py-3.5 border-b last:border-0"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div>
                    <div className="text-[14.5px] font-medium" style={{ color: "var(--ink)" }}>{range}</div>
                    {sub && <div className="font-mono text-[11.5px] mt-0.5" style={{ color: "var(--muted)" }}>{sub}</div>}
                  </div>
                  <Price value={premium} />
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        {/* Notes */}
        <div className="mt-5 flex flex-col gap-2">
          {NOTES.map((note) => (
            <p key={note} className="relative pl-4 text-[13.5px] leading-[1.55]" style={{ color: "var(--stone)" }}>
              <span
                className="absolute left-1 -top-0.5 text-lg font-bold leading-none"
                style={{ color: "var(--navy-accent)" }}
              >·</span>
              {note}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
