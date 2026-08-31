import Link from "next/link";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { CheckIcon } from "@/components/ui/CheckIcon";

function AppFeedMockup() {
  return (
    <div
      className="mx-auto"
      style={{
        width: "260px",
        background: "var(--on-ink)",
        borderRadius: "40px",
        padding: "7px",
        boxShadow: "var(--shadow-xl), 0 0 0 1px var(--border)",
      }}
    >
      <div
        className="w-full flex flex-col overflow-hidden"
        style={{ background: "var(--bg)", borderRadius: "33px", minHeight: "520px" }}
      >
        {/* Notch */}
        <div
          className="flex-shrink-0 flex justify-center pt-2 pb-1"
          style={{ background: "var(--on-ink)", borderRadius: "33px 33px 0 0" }}
        >
          <div className="h-[16px] w-14 rounded-pill" style={{ background: "var(--on-ink)" }} />
        </div>

        {/* App header */}
        <div
          className="px-4 pt-3 pb-3 flex items-center justify-between border-b flex-shrink-0"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div>
            <p className="font-mono text-[8px] uppercase tracking-[.1em]" style={{ color: "var(--muted)" }}>Igreja da Graça</p>
            <p className="text-[13px] font-semibold tracking-[-0.02em]" style={{ color: "var(--ink)" }}>Início</p>
          </div>
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: "var(--navy-dim)", color: "var(--navy-accent)" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
        </div>

        {/* Feed */}
        <div className="flex-1 px-3 pt-3 flex flex-col gap-2.5 overflow-hidden">

          {/* Push notification banner */}
          <div
            className="rounded-[10px] p-3 flex items-start gap-2.5"
            style={{ background: "var(--navy-accent)", color: "#fff" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-px">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <div>
              <p className="text-[10px] font-semibold mb-0.5">Aviso da liderança</p>
              <p className="text-[9px] font-light opacity-80 leading-snug">Culto de quarta transferido para as 20h.</p>
            </div>
          </div>

          {/* Devocional card */}
          <div
            className="rounded-[10px] border overflow-hidden"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div className="px-3 py-2 border-b" style={{ background: "var(--teal-dim)", borderColor: "var(--border)" }}>
              <p className="font-mono text-[8px] uppercase tracking-[.1em]" style={{ color: "#00B8A2" }}>Devocional · Hoje</p>
            </div>
            <div className="px-3 py-2.5">
              <p className="text-[11px] font-semibold mb-1" style={{ color: "var(--ink)" }}>Salmos 23 — O Senhor é meu pastor</p>
              <p className="text-[9px] font-light leading-relaxed" style={{ color: "var(--stone)" }}>
                "O Senhor é o meu pastor, nada me faltará." Uma meditação sobre confiar no cuidado de Deus...
              </p>
              <p className="font-mono text-[8px] mt-1.5" style={{ color: "var(--navy-accent)" }}>Ler mais →</p>
            </div>
          </div>

          {/* Event card */}
          <div
            className="rounded-[10px] border p-3 flex items-center gap-2.5"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div
              className="w-9 h-9 rounded-[8px] flex flex-col items-center justify-center flex-shrink-0"
              style={{ background: "var(--subtle)" }}
            >
              <p className="font-mono text-[8px] font-medium" style={{ color: "var(--navy-accent)" }}>JUN</p>
              <p className="text-[14px] font-bold leading-none" style={{ color: "var(--ink)" }}>8</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold" style={{ color: "var(--ink)" }}>Culto de Jovens</p>
              <p className="font-mono text-[9px] mt-0.5" style={{ color: "var(--muted)" }}>Dom · 19h · Templo principal</p>
            </div>
          </div>

          {/* Prayer request */}
          <div
            className="rounded-[10px] border p-3"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#C0392B" }}>
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              <p className="font-mono text-[8px] uppercase tracking-[.08em]" style={{ color: "var(--muted)" }}>Pedido de oração</p>
            </div>
            <p className="text-[10px] font-light leading-snug" style={{ color: "var(--stone)" }}>
              Marina R. pede oração pela recuperação da mãe.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="font-mono text-[8px] px-2 py-0.5 rounded-pill" style={{ background: "var(--navy-dim)", color: "var(--navy-accent)" }}>
                12 orando
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ConteudosHero() {
  return (
    <section className="relative overflow-hidden pt-14 pb-24 md:pt-16 md:pb-28">
      <div
        className="pointer-events-none absolute -top-40 -right-40 w-[600px] h-[600px] -z-10"
        style={{ background: "radial-gradient(circle, var(--hero-glow), transparent 60%)" }}
      />

      <div className="mx-auto max-w-[1180px] px-6">
        <div className="grid grid-cols-1 gap-12 items-center md:grid-cols-[1.2fr_1fr] md:gap-14">
          <div>
            <SectionLabel className="mb-6">Funcionalidades · Conteúdos</SectionLabel>

            <h1
              className="font-light leading-[1.02] tracking-[-0.035em] mb-5"
              style={{ fontSize: "clamp(38px, 6vw, 64px)", color: "var(--ink)" }}
            >
              A igreja{" "}
              <strong className="font-semibold" style={{ color: "var(--navy-accent)" }}>
                presente
              </strong>
              {" "}entre os cultos.
            </h1>

            <p
              className="font-light leading-[1.55] mb-8 max-w-[500px]"
              style={{ fontSize: "clamp(16px, 1.7vw, 18px)", color: "var(--stone)" }}
            >
              Avisos, devocionais, agenda e pedidos de oração no app com a cara da sua igreja. O membro se sente conectado de segunda a sábado — não só no domingo.
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
                href="/funcionalidades"
                className="inline-flex h-12 items-center gap-2 rounded-btn border px-6 text-[15px] font-medium transition-all"
                style={{ color: "var(--navy-accent)", borderColor: "var(--navy-accent)" }}
              >
                Ver todos os módulos
              </Link>
            </div>

            <div className="flex gap-5 flex-wrap font-mono text-[11.5px] tracking-[.04em]" style={{ color: "var(--muted)" }}>
              {["PUSH NATIVO", "DEVOCIONAIS DIÁRIOS", "PEDIDOS DE ORAÇÃO"].map((label) => (
                <span key={label} className="inline-flex items-center gap-1.5">
                  <CheckIcon size="sm" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="flex justify-center md:justify-end">
            <AppFeedMockup />
          </div>
        </div>
      </div>
    </section>
  );
}
