import Link from "next/link";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { CheckIcon } from "@/components/ui/CheckIcon";

const GRUPOS = [
  { nome: "Célula Alfa",    membros: 12, reunioes: "4 reuniões",  dot: "#22C55E", dotShadow: "rgba(34,197,94,.18)",   status: "Saudável",   statusBg: "rgba(34,197,94,.1)",   statusColor: "#22C55E" },
  { nome: "PG Jovens",      membros: 9,  reunioes: "3 reuniões",  dot: "#22C55E", dotShadow: "rgba(34,197,94,.18)",   status: "Saudável",   statusBg: "rgba(34,197,94,.1)",   statusColor: "#22C55E" },
  { nome: "Célula Bética",  membros: 7,  reunioes: "2 reuniões",  dot: "#EAB308", dotShadow: "rgba(234,179,8,.18)",   status: "Atenção",    statusBg: "rgba(234,179,8,.1)",   statusColor: "#EAB308" },
  { nome: "Célula Delta",   membros: 3,  reunioes: "0 reuniões",  dot: "#C0392B", dotShadow: "var(--crimson-dim)",    status: "Inativo",    statusBg: "var(--crimson-dim)",   statusColor: "#C0392B" },
] as const;

function GroupListMockup() {
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
          Pequenos Grupos · 4 ativos
        </span>
        <span className="font-mono text-[10px]" style={{ color: "var(--navy-accent)" }}>+ Novo grupo</span>
      </div>

      {/* Summary pills */}
      <div className="flex gap-2 px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
        {[
          { label: "2 saudáveis",  bg: "rgba(34,197,94,.1)",  color: "#22C55E" },
          { label: "1 em atenção", bg: "rgba(234,179,8,.1)",  color: "#EAB308" },
          { label: "1 inativo",    bg: "var(--crimson-dim)",  color: "#C0392B" },
        ].map(({ label, bg, color }) => (
          <span
            key={label}
            className="font-mono text-[10px] font-medium px-2.5 py-1 rounded-pill"
            style={{ background: bg, color }}
          >
            {label}
          </span>
        ))}
      </div>

      {/* Group rows */}
      <div className="flex flex-col divide-y" style={{ borderColor: "var(--border)" }}>
        {GRUPOS.map(({ nome, membros, reunioes, dot, dotShadow, status, statusBg, statusColor }) => (
          <div key={nome} className="flex items-center gap-3.5 px-5 py-3.5">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ background: dot, boxShadow: `0 0 0 3px ${dotShadow}` }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>{nome}</p>
              <p className="font-mono text-[10px] mt-0.5" style={{ color: "var(--muted)" }}>
                {membros} membros · {reunioes} este mês
              </p>
            </div>
            <span
              className="font-mono text-[10px] font-medium px-2 py-0.5 rounded-pill flex-shrink-0"
              style={{ background: statusBg, color: statusColor }}
            >
              {status}
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div
        className="px-5 py-3 border-t flex items-center justify-between"
        style={{ background: "var(--bg)", borderColor: "var(--border)" }}
      >
        <span className="font-mono text-[10px]" style={{ color: "var(--muted)" }}>Última atualização: hoje, 20:15</span>
        <span className="font-mono text-[10px]" style={{ color: "var(--navy-accent)" }}>Ver relatório →</span>
      </div>
    </div>
  );
}

export function PequenosGruposHero() {
  return (
    <section className="relative overflow-hidden pt-14 pb-24 md:pt-16 md:pb-28">
      <div
        className="pointer-events-none absolute -top-40 -right-40 w-[600px] h-[600px] -z-10"
        style={{ background: "radial-gradient(circle, var(--hero-glow), transparent 60%)" }}
      />

      <div className="mx-auto max-w-[1180px] px-6">
        <div className="grid grid-cols-1 gap-12 items-center md:grid-cols-[1.1fr_1fr] md:gap-14">
          <div>
            <SectionLabel className="mb-6">Funcionalidades · Pequenos Grupos</SectionLabel>

            <h1
              className="font-light leading-[1.02] tracking-[-0.035em] mb-5"
              style={{ fontSize: "clamp(38px, 6vw, 64px)", color: "var(--ink)" }}
            >
              Grupos{" "}
              <strong className="font-semibold" style={{ color: "var(--navy-accent)" }}>
                saudáveis
              </strong>
              {" "}não aparecem por acaso.
            </h1>

            <p
              className="font-light leading-[1.55] mb-8 max-w-[500px]"
              style={{ fontSize: "clamp(16px, 1.7vw, 18px)", color: "var(--stone)" }}
            >
              Materiais agendados, notificação automática pro líder e semáforo de saúde — o pastor sabe qual célula está esfriando antes que seja tarde.
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
              {["SEMÁFORO DE SAÚDE", "MATERIAIS AGENDADOS", "LÍDER NO CELULAR"].map((label) => (
                <span key={label} className="inline-flex items-center gap-1.5">
                  <CheckIcon size="sm" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div>
            <GroupListMockup />
          </div>
        </div>
      </div>
    </section>
  );
}
