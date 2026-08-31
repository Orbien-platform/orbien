import Link from "next/link";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { CheckIcon } from "@/components/ui/CheckIcon";

const MEMBERS = [
  { initials: "MR", name: "Marina Rodrigues",   sub: "Membro · Líder de célula",      badge: "Membro",       badgeBg: "var(--teal-dim)",  badgeColor: "#00B8A2", dot: "#00B8A2" },
  { initials: "JP", name: "João Pedro Souza",    sub: "Frequentador · 3ª visita",       badge: "Frequentador", badgeBg: "var(--navy-dim)",  badgeColor: "var(--navy-accent)", dot: "var(--navy-accent)" },
  { initials: "AB", name: "Ana Beatriz Lima",    sub: "Visitante · ontem, 1ª visita",   badge: "Visitante",    badgeBg: "var(--subtle)",    badgeColor: "var(--stone)", dot: "var(--muted)" },
  { initials: "CM", name: "Carlos Mendes",       sub: "Membro · ausente há 3 semanas",  badge: "Atenção",      badgeBg: "var(--crimson-dim)", badgeColor: "var(--color-crimson)", dot: "#C0392B" },
] as const;

function MemberListMockup() {
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
          Membros e Visitantes · 247
        </span>
        <div className="flex items-center gap-2">
          <span
            className="font-mono text-[10px] px-2.5 py-1 rounded-pill"
            style={{ background: "var(--teal-dim)", color: "#00B8A2" }}
          >
            + Cadastrar
          </span>
        </div>
      </div>

      {/* Rows */}
      <div className="flex flex-col">
        {MEMBERS.map(({ initials, name, sub, badge, badgeBg, badgeColor, dot }, i) => (
          <div
            key={name}
            className={`flex items-center gap-3.5 px-5 py-3.5 ${i > 0 ? "border-t" : ""}`}
            style={{ borderColor: "var(--border)" }}
          >
            <div
              className="w-9 h-9 rounded-avatar flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
              style={{ background: "var(--navy-dim)", color: "var(--navy-accent)" }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium truncate" style={{ color: "var(--ink)" }}>{name}</p>
              <p className="font-mono text-[10px] mt-0.5 flex items-center gap-1.5" style={{ color: "var(--muted)" }}>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dot }} />
                {sub}
              </p>
            </div>
            <span
              className="font-mono text-[10px] px-2 py-0.5 rounded-pill flex-shrink-0"
              style={{ background: badgeBg, color: badgeColor }}
            >
              {badge}
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div
        className="px-5 py-3 border-t flex items-center justify-between"
        style={{ background: "var(--bg)", borderColor: "var(--border)" }}
      >
        <span className="font-mono text-[10px]" style={{ color: "var(--muted)" }}>4 de 247 membros</span>
        <span className="font-mono text-[10px]" style={{ color: "var(--navy-accent)" }}>Ver todos →</span>
      </div>
    </div>
  );
}

export function MembrosHero() {
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
            <SectionLabel className="mb-6">Funcionalidades · Membros</SectionLabel>

            <h1
              className="font-light leading-[1.02] tracking-[-0.035em] mb-5"
              style={{ fontSize: "clamp(38px, 6.2vw, 66px)", color: "var(--ink)" }}
            >
              Do visitante ao membro{" "}
              <strong className="font-semibold" style={{ color: "var(--navy-accent)" }}>
                — sem planilha.
              </strong>
            </h1>

            <p
              className="font-light leading-[1.55] mb-8 max-w-[500px]"
              style={{ fontSize: "clamp(16px, 1.7vw, 18px)", color: "var(--stone)" }}
            >
              Cadastre em 30 segundos pelo QR code. Acompanhe quem voltou, quem sumiu e quem virou membro — sem esforço manual para a secretária.
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
              {["QR CODE NA ENTRADA", "DEDUPLICAÇÃO", "HISTÓRICO COMPLETO"].map((label) => (
                <span key={label} className="inline-flex items-center gap-1.5">
                  <CheckIcon size="sm" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Mockup */}
          <div>
            <MemberListMockup />
          </div>
        </div>
      </div>
    </section>
  );
}
