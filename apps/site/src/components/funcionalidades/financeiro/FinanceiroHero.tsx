import Link from "next/link";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { CheckIcon } from "@/components/ui/CheckIcon";

function DashboardMockup() {
  const bars = [55, 72, 48, 83, 61, 95, 78];
  const max = Math.max(...bars);

  return (
    <div
      className="rounded-[14px] overflow-hidden border"
      style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-lg)" }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-5 py-3.5 border-b"
        style={{ background: "var(--subtle)", borderColor: "var(--border)" }}
      >
        <span className="font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--muted)" }}>
          Financeiro · Este mês
        </span>
        <span className="font-mono text-[10px]" style={{ color: "var(--navy-accent)" }}>Exportar</span>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 divide-x" style={{ borderBottom: "1px solid var(--border)", borderColor: "var(--border)" }}>
        {[
          { label: "Arrecadação",  value: "R$ 4.820", delta: "+14%",  deltaOk: true  },
          { label: "Dizimistas",   value: "68%",       delta: "meta 70%", deltaOk: true },
          { label: "Doadores",     value: "34",        delta: "+3 vs mês ant.", deltaOk: true },
        ].map(({ label, value, delta, deltaOk }) => (
          <div key={label} className="px-4 py-3.5" style={{ borderColor: "var(--border)" }}>
            <p className="font-mono text-[9px] uppercase tracking-[.06em] mb-1" style={{ color: "var(--muted)" }}>{label}</p>
            <p className="text-[17px] font-semibold tracking-[-0.025em]" style={{ color: "var(--ink)" }}>{value}</p>
            <p className="font-mono text-[9px] mt-0.5" style={{ color: deltaOk ? "#00B8A2" : "#C0392B" }}>{delta}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="px-5 pt-4 pb-3">
        <p className="font-mono text-[9px] uppercase tracking-[.08em] mb-3" style={{ color: "var(--muted)" }}>
          Doações · últimos 7 dias
        </p>
        <div className="flex items-end gap-1.5 h-16">
          {bars.map((h, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full rounded-sm transition-all"
                style={{
                  height: `${(h / max) * 56}px`,
                  background: i === bars.length - 1 ? "var(--navy-accent)" : "var(--navy-dim)",
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1.5 font-mono text-[8px]" style={{ color: "var(--muted)" }}>
          <span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span><span>Dom</span>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="border-t" style={{ borderColor: "var(--border)" }}>
        {[
          { name: "Marina R.",  value: "R$ 250,00", type: "Dízimo",   time: "hoje, 10:24" },
          { name: "João P.",    value: "R$ 50,00",  type: "Oferta",   time: "hoje, 09:11" },
          { name: "Ana B.",     value: "R$ 100,00", type: "Dízimo",   time: "ontem, 20:05" },
        ].map(({ name, value, type, time }, i) => (
          <div
            key={name}
            className={`flex items-center gap-3 px-5 py-2.5 ${i > 0 ? "border-t" : ""}`}
            style={{ borderColor: "var(--border)" }}
          >
            <div
              className="w-7 h-7 rounded-[6px] flex items-center justify-center text-[10px] font-semibold flex-shrink-0"
              style={{ background: "var(--teal-dim)", color: "#00B8A2" }}
            >
              {name.split(" ").map(w => w[0]).join("")}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium" style={{ color: "var(--ink)" }}>{name}</p>
              <p className="font-mono text-[9px]" style={{ color: "var(--muted)" }}>{type} · {time}</p>
            </div>
            <p className="font-mono text-[12px] font-medium" style={{ color: "var(--ink)" }}>{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FinanceiroHero() {
  return (
    <section className="relative overflow-hidden pt-14 pb-24 md:pt-16 md:pb-28">
      <div
        className="pointer-events-none absolute -top-40 -right-40 w-[600px] h-[600px] -z-10"
        style={{ background: "radial-gradient(circle, var(--hero-glow), transparent 60%)" }}
      />

      <div className="mx-auto max-w-[1180px] px-6">
        <div className="grid grid-cols-1 gap-12 items-center md:grid-cols-[1.1fr_1fr] md:gap-14">
          <div>
            <SectionLabel className="mb-6">Funcionalidades · Financeiro</SectionLabel>

            <h1
              className="font-light leading-[1.02] tracking-[-0.035em] mb-5"
              style={{ fontSize: "clamp(38px, 6vw, 64px)", color: "var(--ink)" }}
            >
              O dinheiro da sua igreja,{" "}
              <strong className="font-semibold" style={{ color: "var(--navy-accent)" }}>
                organizado.
              </strong>
            </h1>

            <p
              className="font-light leading-[1.55] mb-8 max-w-[500px]"
              style={{ fontSize: "clamp(16px, 1.7vw, 18px)", color: "var(--stone)" }}
            >
              PIX com recibo automático, relatório semanal pronto para a tesoureira e dízimo recorrente sem nenhum trabalho manual. Transparência financeira sem precisar de um contador no grupo.
            </p>

            <div className="flex gap-3 flex-wrap items-center mb-7">
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
              <Link
                href="/precos"
                className="inline-flex h-12 items-center gap-2 rounded-btn border px-6 text-[15px] font-medium transition-all"
                style={{ color: "var(--navy-accent)", borderColor: "var(--navy-accent)" }}
              >
                Ver planos
              </Link>
            </div>

            <div className="flex gap-5 flex-wrap font-mono text-[11.5px] tracking-[.04em]" style={{ color: "var(--muted)" }}>
              {["PIX NATIVO", "RECIBO AUTOMÁTICO", "SEM TAXA NO STARTER"].map((label) => (
                <span key={label} className="inline-flex items-center gap-1.5">
                  <CheckIcon size="sm" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div>
            <DashboardMockup />
          </div>
        </div>
      </div>
    </section>
  );
}
