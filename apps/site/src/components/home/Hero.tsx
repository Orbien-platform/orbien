import Link from "next/link";
import { CheckIcon } from "@/components/ui/CheckIcon";
import { SectionLabel } from "@/components/ui/SectionLabel";

function DashboardMockup() {
  return (
    <div
      className="absolute overflow-hidden flex flex-col"
      style={{
        top: "8%", left: 0, right: "14%", bottom: "14%",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "14px",
        boxShadow: "var(--shadow-xl)",
        transform: "perspective(1600px) rotateY(-6deg) rotateX(2deg)",
        transformOrigin: "center right",
      }}
    >
      {/* Browser bar */}
      <div
        className="h-7 flex items-center gap-1.5 px-3 flex-shrink-0 border-b"
        style={{ background: "var(--subtle)", borderColor: "var(--border)" }}
      >
        {[1, 2, 3].map((i) => (
          <span key={i} className="w-2 h-2 rounded-full" style={{ background: "var(--border-strong)" }} />
        ))}
        <span className="ml-4 font-mono text-[10px]" style={{ color: "var(--muted)" }}>
          orbien.app/painel
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col gap-3.5 p-4 min-h-0 overflow-hidden">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[.08em] mb-0.5" style={{ color: "var(--muted)" }}>
              Painel · Esta semana
            </div>
            <div className="text-[13px] font-medium tracking-[-0.01em]" style={{ color: "var(--ink)" }}>
              Olá, Pastor André
            </div>
          </div>
          <span
            className="font-mono text-[9px] px-2 py-1 rounded-pill tracking-[.06em]"
            style={{ background: "var(--teal-dim)", color: "#00B8A2" }}
          >
            ● Ao vivo
          </span>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Doações", val: "R$ 2.840", delta: "+14%" },
            { label: "Visitantes", val: "12", delta: "+3 vs sem. ant." },
            { label: "Células ativas", val: "3", delta: "de 4" },
          ].map(({ label, val, delta }) => (
            <div
              key={label}
              className="rounded-btn p-2.5 border"
              style={{ background: "var(--subtle)", borderColor: "var(--border)" }}
            >
              <div className="font-mono text-[9px] uppercase tracking-[.06em] mb-1" style={{ color: "var(--muted)" }}>
                {label}
              </div>
              <div className="text-base font-semibold tracking-[-0.02em]" style={{ color: "var(--ink)" }}>
                {val}
              </div>
              <div className="font-mono text-[9px] mt-0.5" style={{ color: "#00B8A2" }}>
                {delta}
              </div>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div
          className="flex-1 min-h-[80px] rounded-btn relative overflow-hidden"
          style={{
            background: "linear-gradient(180deg, var(--navy-tint) 0%, transparent 100%)",
            color: "var(--navy-accent)",
          }}
        >
          <div
            className="absolute left-2.5 top-2 font-mono text-[9px] uppercase tracking-[.08em]"
            style={{ color: "var(--navy-accent)" }}
          >
            Doações · últimos 7 dias
          </div>
          <svg viewBox="0 0 300 80" preserveAspectRatio="none" className="w-full h-full">
            <defs>
              <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity=".3" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0,60 L40,52 L80,58 L120,40 L160,46 L200,28 L240,32 L300,18 L300,80 L0,80 Z"
              fill="url(#chart-grad)"
            />
            <path
              d="M0,60 L40,52 L80,58 L120,40 L160,46 L200,28 L240,32 L300,18"
              stroke="currentColor" strokeWidth="1.5" fill="none"
            />
            <circle cx="300" cy="18" r="3" fill="#00B8A2" />
          </svg>
        </div>

        {/* Member row */}
        <div
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-btn border"
          style={{ background: "var(--subtle)", borderColor: "var(--border)" }}
        >
          <div
            className="w-[22px] h-[22px] rounded-[6px] flex items-center justify-center text-[9px] font-semibold flex-shrink-0"
            style={{ background: "var(--navy-dim)", color: "var(--navy-accent)" }}
          >
            MR
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium" style={{ color: "var(--ink)" }}>
              Marina Rodrigues
            </div>
            <div className="font-mono text-[9px] tracking-[.04em]" style={{ color: "var(--muted)" }}>
              3ª visita · sem célula
            </div>
          </div>
          <span
            className="text-[9px] font-medium px-1.5 py-0.5 rounded-pill"
            style={{ background: "var(--teal-dim)", color: "#00B8A2" }}
          >
            Acompanhar
          </span>
        </div>
      </div>
    </div>
  );
}

function PhoneMockup() {
  return (
    <div
      className="absolute right-0 bottom-0 w-[38%]"
      style={{
        aspectRatio: "9/19",
        background: "var(--on-ink)",
        borderRadius: "28px",
        padding: "6px",
        boxShadow: "var(--shadow-xl), 0 0 0 1px var(--border)",
        transform: "perspective(1400px) rotateY(8deg) rotateX(2deg) translateZ(0)",
        transformOrigin: "left center",
      }}
    >
      <div
        className="w-full h-full flex flex-col overflow-hidden relative"
        style={{ background: "var(--surface)", borderRadius: "22px" }}
      >
        {/* Notch */}
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 z-10 h-[18px] w-16 rounded-pill"
          style={{ background: "var(--on-ink)" }}
        />

        {/* Header */}
        <div
          className="pt-9 px-3.5 pb-3 border-b flex-shrink-0"
          style={{ background: "var(--bg)", borderColor: "var(--border)" }}
        >
          <div className="font-mono text-[8px] uppercase tracking-[.12em] mb-1" style={{ color: "var(--muted)" }}>
            Igreja Doca · Visitantes
          </div>
          <h4 className="text-sm font-semibold tracking-[-0.02em]" style={{ color: "var(--ink)" }}>
            Cadastrar visitante
          </h4>
        </div>

        {/* Form fields */}
        <div className="flex-1 px-3.5 pt-3 flex flex-col gap-2.5">
          {[
            { label: "Nome", val: "João Pedro Souza", focus: false },
            { label: "WhatsApp", val: "(54) 99821-4408", focus: true },
            { label: "Como conheceu", val: "Convite de membro", focus: false },
          ].map(({ label, val, focus }) => (
            <div
              key={label}
              className="rounded-[6px] px-2.5 py-[7px] border"
              style={{
                background: "var(--surface)",
                borderColor: focus ? "#1E3A7B" : "var(--border)",
                boxShadow: focus ? "0 0 0 3px var(--navy-dim)" : undefined,
              }}
            >
              <div className="font-mono text-[8px] uppercase tracking-[.06em] font-medium mb-0.5" style={{ color: "var(--muted)" }}>
                {label}
              </div>
              <div className="text-[11px] font-medium" style={{ color: "var(--ink)" }}>
                {val}
              </div>
            </div>
          ))}

          <div
            className="mt-auto rounded-btn p-2.5 text-center text-[11px] font-medium text-white"
            style={{ background: "#1E3A7B" }}
          >
            Cadastrar visitante
          </div>
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden py-14 pb-24 md:py-14 md:pb-24">
      {/* Radial glow */}
      <div
        className="pointer-events-none absolute -top-48 -right-48 w-[700px] h-[700px] -z-10"
        style={{
          background: "radial-gradient(circle, var(--hero-glow), transparent 65%)",
        }}
      />

      <div className="mx-auto max-w-[1180px] px-6">
        <div className="grid grid-cols-1 gap-10 items-center md:grid-cols-[1.05fr_1fr] md:gap-14">
          {/* Content */}
          <div>
            <SectionLabel className="mb-6">Plataforma de gestão para igrejas</SectionLabel>

            <h1
              className="font-semibold leading-[1.02] tracking-[-0.035em] mb-5"
              style={{
                fontSize: "clamp(36px, 6.4vw, 68px)",
                color: "var(--ink)",
              }}
            >
              A plataforma de gestão que{" "}
              <span style={{ color: "var(--navy-accent)" }}>cabe na sua igreja.</span>
            </h1>

            <p
              className="font-light leading-[1.55] mb-8 max-w-[520px]"
              style={{
                fontSize: "clamp(17px, 1.8vw, 19px)",
                color: "var(--stone)",
              }}
            >
              Membros, finanças, células e app próprio nas lojas — mesmo que sua igreja ainda não tenha CNPJ. Comece hoje, sem cartão de crédito.
            </p>

            <div className="flex gap-3 flex-wrap items-center mb-7">
              <Link
                href="#waitlist"
                className="inline-flex h-12 items-center gap-2 rounded-btn bg-navy px-6 text-[15px] font-medium text-white transition-all hover:bg-navy-dark hover:-translate-y-px"
              >
                Entrar na lista de espera
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
              <Link
                href="#pilares"
                className="inline-flex h-12 items-center gap-2 rounded-btn border px-6 text-[15px] font-medium transition-all"
                style={{
                  color: "var(--navy-accent)",
                  borderColor: "var(--navy-accent)",
                }}
              >
                Ver como funciona
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
                </svg>
              </Link>
            </div>

            {/* Meta badges */}
            <div className="flex gap-5 flex-wrap font-mono text-[12px] tracking-[.04em]" style={{ color: "var(--muted)" }}>
              {["SEM CNPJ", "SEM CARTÃO", "5 MIN PARA COMEÇAR"].map((label) => (
                <span key={label} className="inline-flex items-center gap-1.5">
                  <CheckIcon size="sm" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Mockup stage */}
          <div
            className="relative w-full"
            style={{ aspectRatio: "5/4.2", minHeight: "380px" }}
          >
            <DashboardMockup />
            <PhoneMockup />
          </div>
        </div>
      </div>
    </section>
  );
}
