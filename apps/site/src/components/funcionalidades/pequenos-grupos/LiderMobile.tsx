import Image from "next/image";
import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";

const STEPS = [
  {
    time: "18:00",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
    title: "Notificação automática",
    desc: "\"Reunião da Célula Alfa hoje às 19h. Material de estudo disponível.\"",
  },
  {
    time: "19:45",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      </svg>
    ),
    title: "Líder registra presença",
    desc: "Marca os presentes no celular. Leva 2 minutos — não sai da reunião.",
  },
  {
    time: "20:00",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
    title: "Painel atualizado",
    desc: "A secretária e o pastor veem a presença e o semáforo atualizado em tempo real.",
  },
] as const;

function PhoneMockup() {
  return (
    <div
      className="mx-auto w-[220px]"
      style={{
        background: "var(--on-ink)",
        borderRadius: "36px",
        padding: "6px",
        boxShadow: "var(--shadow-xl), 0 0 0 1px var(--border)",
      }}
    >
      <div
        className="w-full h-full flex flex-col overflow-hidden relative"
        style={{ background: "var(--surface)", borderRadius: "30px", minHeight: "420px" }}
      >
        {/* Notch */}
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 z-10 h-[16px] w-14 rounded-pill"
          style={{ background: "var(--on-ink)" }}
        />

        {/* App header */}
        <div
          className="pt-9 px-4 pb-3 border-b flex-shrink-0"
          style={{ background: "var(--bg)", borderColor: "var(--border)" }}
        >
          <p className="font-mono text-[8px] uppercase tracking-[.1em] mb-0.5" style={{ color: "var(--muted)" }}>
            Célula Alfa · Reunião
          </p>
          <p className="text-[13px] font-semibold tracking-[-0.02em]" style={{ color: "var(--ink)" }}>
            Registrar presença
          </p>
        </div>

        {/* Member list */}
        <div className="flex-1 px-3 pt-3 flex flex-col gap-2">
          {[
            { initials: "MR", name: "Marina R.",  present: true  },
            { initials: "JP", name: "João P.",    present: true  },
            { initials: "AB", name: "Ana B.",     present: false },
            { initials: "CM", name: "Carlos M.", present: true  },
            { initials: "LS", name: "Lucia S.",  present: false },
          ].map(({ initials, name, present }) => (
            <div
              key={name}
              className="flex items-center gap-2.5 rounded-btn px-2.5 py-2 border"
              style={{
                background: present ? "rgba(0,184,162,.06)" : "var(--surface)",
                borderColor: present ? "rgba(0,184,162,.3)" : "var(--border)",
              }}
            >
              <div
                className="w-7 h-7 rounded-[6px] flex items-center justify-center text-[9px] font-semibold flex-shrink-0"
                style={{ background: "var(--navy-dim)", color: "var(--navy-accent)" }}
              >
                {initials}
              </div>
              <span className="flex-1 text-[11px] font-medium" style={{ color: "var(--ink)" }}>{name}</span>
              <span
                className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  background: present ? "#00B8A2" : "var(--subtle)",
                  color: present ? "#fff" : "var(--muted)",
                }}
              >
                {present && (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </span>
            </div>
          ))}

          {/* Submit button */}
          <div
            className="mt-auto rounded-btn py-2.5 text-center text-[11px] font-medium text-white"
            style={{ background: "var(--navy-accent)" }}
          >
            Salvar presença (3 / 5)
          </div>
        </div>
      </div>
    </div>
  );
}

export function LiderMobile() {
  return (
    <section className="py-20 md:py-24">
      <div className="mx-auto max-w-[1180px] px-6">
        <div className="grid grid-cols-1 gap-14 items-center md:grid-cols-[1fr_1fr] md:gap-16">
          {/* Left — text */}
          <Reveal>
            <SectionLabel className="mb-[18px]">Experiência do líder</SectionLabel>
            <h2
              className="font-medium tracking-[-0.025em] mb-5"
              style={{ fontSize: "clamp(28px, 3.8vw, 42px)", lineHeight: 1.1, color: "var(--ink)" }}
            >
              O líder registra no celular. O pastor vê na hora.
            </h2>
            <p className="text-[16px] font-light leading-relaxed mb-8 max-w-[460px]" style={{ color: "var(--stone)" }}>
              Nenhum líder vai abrir o computador depois da reunião para preencher planilha. O app resolve em 2 minutos — pelo celular, ainda no grupo.
            </p>

            {/* Timeline */}
            <div className="flex flex-col gap-0">
              {STEPS.map(({ time, icon, title, desc }, i) => (
                <div key={time} className="flex gap-4">
                  {/* Timeline line + dot */}
                  <div className="flex flex-col items-center">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: "var(--navy-tint)", color: "var(--navy-accent)" }}
                    >
                      {icon}
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className="w-px flex-1 my-1" style={{ background: "var(--border)" }} />
                    )}
                  </div>
                  {/* Content */}
                  <div className={`pb-6 ${i === STEPS.length - 1 ? "pb-0" : ""}`}>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="font-mono text-[11px] font-medium" style={{ color: "var(--navy-accent)" }}>{time}</span>
                      <span className="text-[14.5px] font-semibold" style={{ color: "var(--ink)" }}>{title}</span>
                    </div>
                    <p className="text-[13.5px] font-light leading-relaxed" style={{ color: "var(--stone)" }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

          {/* Right — phone + image placeholder */}
          <Reveal>
            <div className="flex flex-col items-center gap-4">
              <PhoneMockup />

              {/* next/image placeholder para screenshot real do app */}
              <div
                className="relative w-full max-w-[320px] rounded-[14px] overflow-hidden border"
                style={{ borderColor: "var(--border)" }}
              >
                <Image
                  src="/placeholder-membros-painel.svg"
                  alt="Screenshot do painel do pastor mostrando a visão geral de todos os pequenos grupos com semáforo de saúde, número de membros e data da última reunião"
                  width={640}
                  height={180}
                  className="w-full"
                  style={{ display: "block", opacity: 0.4 }}
                  priority={false}
                />
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center gap-1"
                  style={{ background: "linear-gradient(to bottom, transparent 20%, var(--surface) 80%)" }}
                >
                  <span
                    className="font-mono text-[10px] uppercase tracking-[.12em] px-3 py-1.5 rounded-pill"
                    style={{ background: "var(--subtle)", color: "var(--muted)", border: "1px solid var(--border)" }}
                  >
                    Visão do pastor · em breve
                  </span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
