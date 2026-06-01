import { Reveal } from "@/components/ui/Reveal";

function Check() {
  return (
    <span
      className="w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0"
      style={{ background: "var(--teal-dim)", color: "#00B8A2" }}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  );
}

function Cross() {
  return (
    <span
      className="w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0"
      style={{ background: "var(--crimson-dim)", color: "#C0392B" }}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </span>
  );
}

const ROWS = [
  { feature: "Exige CNPJ", other: "Sim", ours: "Não", otherOk: false, oursOk: true },
  { feature: "App nas lojas", other: "Só nos planos caros", ours: "Starter já tem", otherOk: false, oursOk: true },
  { feature: "PIX com recibo automático", other: "Plano alto", ours: "Starter já tem", otherOk: false, oursOk: true },
  { feature: "UX", other: "Datada", ours: "Mobile-first", otherOk: false, oursOk: true },
  { feature: "Tempo pra começar", other: "Dias", ours: "5 minutos", otherOk: false, oursOk: true },
] as const;

export function Comparison() {
  return (
    <section className="py-20 md:py-24" id="comparativo">
      <div className="mx-auto max-w-[1180px] px-6">
        <Reveal className="mb-12">
          <p
            className="inline-flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[.14em] mb-[18px]"
            style={{ color: "var(--navy-accent)" }}
          >
            <span className="w-6 h-px" style={{ background: "var(--navy-accent)" }} />
            Comparativo
          </p>
          <h2
            className="font-medium tracking-[-0.025em] mb-3.5"
            style={{ fontSize: "clamp(30px, 4.2vw, 44px)", lineHeight: 1.1, color: "var(--ink)" }}
          >
            Por que igrejas que tentaram outros sistemas ficam.
          </h2>
          <p className="text-[17px] font-light leading-relaxed max-w-[620px]" style={{ color: "var(--stone)" }}>
            Sem nomes — só os detalhes que importam quando você compara opções.
          </p>
        </Reveal>

        <Reveal>
          <div
            className="rounded-[14px] border overflow-hidden"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            {/* Desktop header */}
            <div
              className="hidden md:grid border-b"
              style={{
                gridTemplateColumns: "1.4fr 1fr 1fr",
                background: "var(--subtle)",
                borderColor: "var(--border)",
              }}
            >
              <div className="px-6 py-[18px]" />
              <div
                className="px-6 py-[18px] font-mono text-[11px] uppercase tracking-[.12em] font-medium"
                style={{ color: "var(--stone)" }}
              >
                Outros sistemas
              </div>
              <div
                className="px-6 py-[18px] font-mono text-[11px] uppercase tracking-[.12em] font-medium"
                style={{ color: "var(--navy-accent)" }}
              >
                Orbien
              </div>
            </div>

            {ROWS.map(({ feature, other, ours }, i) => (
              <div
                key={feature}
                className="border-t"
                style={{ borderColor: "var(--border)" }}
              >
                {/* Desktop row */}
                <div
                  className="hidden md:grid items-center"
                  style={{
                    gridTemplateColumns: "1.4fr 1fr 1fr",
                    background: i % 2 === 0 ? "var(--surface)" : "var(--bg)",
                  }}
                >
                  <div
                    className="px-6 py-[18px] text-[14.5px] font-medium"
                    style={{ color: "var(--ink)" }}
                  >
                    {feature}
                  </div>
                  <div
                    className="px-6 py-[18px] text-sm font-light flex items-center gap-2"
                    style={{ color: "var(--stone)" }}
                  >
                    <Cross /> {other}
                  </div>
                  <div
                    className="px-6 py-[18px] text-sm font-medium flex items-center gap-2"
                    style={{
                      color: "var(--ink)",
                      borderLeft: "2px solid #00B8A2",
                      background: "rgba(0,184,162,.04)",
                    }}
                  >
                    <Check /> {ours}
                  </div>
                </div>

                {/* Mobile stacked */}
                <div
                  className="md:hidden px-[18px]"
                  style={{ background: i % 2 === 0 ? "var(--surface)" : "var(--bg)" }}
                >
                  <div
                    className="pt-4 pb-2 text-[14.5px] font-medium"
                    style={{ color: "var(--ink)" }}
                  >
                    {feature}
                  </div>
                  <div className="flex items-center gap-2 text-sm font-light pb-2" style={{ color: "var(--stone)" }}>
                    <span
                      className="font-mono text-[10px] uppercase tracking-[.1em]"
                      style={{ color: "var(--muted)" }}
                    >
                      Outros ·{" "}
                    </span>
                    <Cross /> {other}
                  </div>
                  <div
                    className="flex items-center gap-2 text-sm font-medium pb-4 border-t"
                    style={{ color: "var(--ink)", borderColor: "var(--border)" }}
                  >
                    <span
                      className="font-mono text-[10px] uppercase tracking-[.1em] pt-2"
                      style={{ color: "var(--navy-accent)" }}
                    >
                      Orbien ·{" "}
                    </span>
                    <Check /> {ours}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
