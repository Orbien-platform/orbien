import Link from "next/link";
import { CheckIcon } from "@/components/ui/CheckIcon";
import { SectionLabel } from "@/components/ui/SectionLabel";

function HeroCard() {
  return (
    <div
      className="rounded-[14px] overflow-hidden border"
      style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-lg)" }}
    >
      {/* Card header */}
      <div
        className="px-6 py-4 border-b flex items-center justify-between"
        style={{ background: "var(--subtle)", borderColor: "var(--border)" }}
      >
        <span className="font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--muted)" }}>
          Igreja da Graça · Plano Starter
        </span>
        <span
          className="font-mono text-[10px] px-2.5 py-1 rounded-pill"
          style={{ background: "var(--teal-dim)", color: "#00B8A2" }}
        >
          ativo
        </span>
      </div>

      {/* PIX receipt */}
      <div className="px-6 py-5 flex flex-col gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.1em] mb-1.5" style={{ color: "var(--muted)" }}>
            Última doação recebida
          </p>
          <p className="text-2xl font-semibold tracking-[-0.03em]" style={{ color: "var(--ink)" }}>
            <span className="font-mono text-base font-normal mr-1" style={{ color: "var(--stone)" }}>R$</span>
            250,00
          </p>
          <p className="text-xs font-light mt-0.5" style={{ color: "var(--stone)" }}>via PIX · hoje, 10:24</p>
        </div>

        <div
          className="rounded-btn px-4 py-3 border"
          style={{ background: "var(--bg)", borderColor: "var(--border)" }}
        >
          <p className="font-mono text-[10px] uppercase tracking-[.1em] mb-1" style={{ color: "var(--muted)" }}>
            Destino
          </p>
          <div className="flex items-center gap-2">
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--navy-tint)", color: "var(--navy-accent)" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </span>
            <div>
              <p className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>Chave PIX da Igreja</p>
              <p className="font-mono text-[10px]" style={{ color: "var(--muted)" }}>telefone · (54) 9 ****-4408</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[12px] font-light" style={{ color: "var(--stone)" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00B8A2" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          Orbien não intermediou esta transação
        </div>
      </div>

      {/* Stats row */}
      <div
        className="grid grid-cols-3 border-t divide-x"
        style={{ borderColor: "var(--border)", background: "var(--bg)" }}
      >
        {[
          { label: "Membros", val: "84" },
          { label: "Este mês", val: "R$1,2k" },
          { label: "Células", val: "6" },
        ].map(({ label, val }) => (
          <div key={label} className="px-4 py-3" style={{ borderColor: "var(--border)" }}>
            <p className="font-mono text-[9px] uppercase tracking-[.06em] mb-0.5" style={{ color: "var(--muted)" }}>
              {label}
            </p>
            <p className="text-sm font-semibold tracking-[-0.015em]" style={{ color: "var(--ink)" }}>
              {val}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SemCnpjHero() {
  return (
    <section className="relative overflow-hidden pt-14 pb-24 md:pt-16 md:pb-28">
      <div
        className="pointer-events-none absolute -top-40 -right-40 w-[600px] h-[600px] -z-10"
        style={{ background: "radial-gradient(circle, var(--hero-glow), transparent 60%)" }}
      />

      <div className="mx-auto max-w-[1180px] px-6">
        <div className="grid grid-cols-1 gap-12 items-center md:grid-cols-[1.1fr_1fr] md:gap-14">
          {/* Content */}
          <div>
            <SectionLabel className="mb-6">Para igrejas sem CNPJ</SectionLabel>

            <h1
              className="font-light leading-[1.02] tracking-[-0.035em] mb-5"
              style={{ fontSize: "clamp(40px, 6.8vw, 72px)", color: "var(--ink)" }}
            >
              Comece hoje.{" "}
              <br className="hidden sm:block" />
              <strong className="font-semibold" style={{ color: "var(--navy-accent)" }}>
                Formalize depois.
              </strong>
            </h1>

            <p
              className="font-light leading-[1.55] mb-8 max-w-[500px]"
              style={{ fontSize: "clamp(16px, 1.7vw, 18px)", color: "var(--stone)" }}
            >
              O Starter foi feito pra quem ainda não tem CNPJ. PIX cai direto na chave da sua igreja — a Orbien não passa perto do dinheiro. Quando formalizar, a migração leva 15 minutos.
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
                Ver plano Starter
              </Link>
            </div>

            <div className="flex gap-5 flex-wrap font-mono text-[11.5px] tracking-[.04em]" style={{ color: "var(--muted)" }}>
              {["PIX DIRETO NA CHAVE", "SEM CNPJ", "MIGRAÇÃO EM 15 MIN"].map((label) => (
                <span key={label} className="inline-flex items-center gap-1.5">
                  <CheckIcon size="sm" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Card */}
          <div>
            <HeroCard />
          </div>
        </div>
      </div>
    </section>
  );
}
