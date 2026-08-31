import Image from "next/image";
import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";

const ALERTS = [
  { dot: "#C0392B", dotShadow: "var(--crimson-dim)", name: "Carlos Mendes",    detail: "Ausente há 4 semanas · Membro",          action: "Ligar" },
  { dot: "#EAB308", dotShadow: "rgba(234,179,8,.18)", name: "Patrícia Lemos",    detail: "Ausente há 2 semanas · Frequentador",     action: "WhatsApp" },
  { dot: "#EAB308", dotShadow: "rgba(234,179,8,.18)", name: "Rodrigo Figueira",  detail: "1ª visita há 14 dias — sem retorno",      action: "WhatsApp" },
  { dot: "#22C55E", dotShadow: "rgba(34,197,94,.18)", name: "Marina Rodrigues",  detail: "Presente toda semana · Membro ativo",     action: "Ver perfil" },
] as const;

export function PresencaPanel() {
  return (
    <section className="py-20 md:py-24" style={{ background: "var(--subtle)" }}>
      <div className="mx-auto max-w-[1180px] px-6">
        <div className="grid grid-cols-1 gap-14 items-center md:grid-cols-[1fr_1fr] md:gap-16">
          {/* Left — text */}
          <Reveal>
            <SectionLabel className="mb-[18px]">Acompanhamento</SectionLabel>
            <h2
              className="font-medium tracking-[-0.025em] mb-5"
              style={{ fontSize: "clamp(28px, 3.8vw, 42px)", lineHeight: 1.1, color: "var(--ink)" }}
            >
              Nenhum visitante some sem que a liderança saiba.
            </h2>
            <p className="text-[16px] font-light leading-relaxed mb-8 max-w-[460px]" style={{ color: "var(--stone)" }}>
              O painel de presença usa semáforo visual — verde, amarelo e vermelho — pra mostrar quem precisa de atenção antes que seja tarde demais.
            </p>

            <div className="flex flex-col gap-4">
              {[
                { color: "#C0392B", label: "Vermelho", desc: "Membro ausente há mais de 3 semanas. Alerta imediato ao pastor." },
                { color: "#EAB308", label: "Amarelo",  desc: "Frequentador ou visitante sem retorno há 2 semanas. Ação sugerida: WhatsApp." },
                { color: "#22C55E", label: "Verde",    desc: "Presença regular. Nenhuma ação necessária." },
              ].map(({ color, label, desc }) => (
                <div key={label} className="flex items-start gap-3.5">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0 mt-1"
                    style={{ background: color, boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 18%, transparent)` }}
                  />
                  <div>
                    <p className="text-[14px] font-medium mb-0.5" style={{ color: "var(--ink)" }}>{label}</p>
                    <p className="text-[13px] font-light leading-relaxed" style={{ color: "var(--stone)" }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

          {/* Right — mockup + next/image placeholder */}
          <Reveal>
            <div
              className="rounded-[14px] overflow-hidden border"
              style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-md)" }}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-5 py-3.5 border-b"
                style={{ background: "var(--subtle)", borderColor: "var(--border)" }}
              >
                <span className="font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--muted)" }}>
                  Radar de Presença
                </span>
                <span className="font-mono text-[10px]" style={{ color: "var(--navy-accent)" }}>Esta semana</span>
              </div>

              {/* List rows */}
              <div className="flex flex-col divide-y" style={{ borderColor: "var(--border)" }}>
                {ALERTS.map(({ dot, dotShadow, name, detail, action }) => (
                  <div key={name} className="flex items-center gap-3.5 px-5 py-3.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: dot, boxShadow: `0 0 0 3px ${dotShadow}` }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>{name}</p>
                      <p className="font-mono text-[10px] mt-0.5" style={{ color: "var(--muted)" }}>{detail}</p>
                    </div>
                    <span
                      className="text-[11px] font-medium px-2.5 py-1 rounded-btn flex-shrink-0"
                      style={{ background: "var(--navy-tint)", color: "var(--navy-accent)" }}
                    >
                      {action}
                    </span>
                  </div>
                ))}
              </div>

              {/* next/image placeholder — area reservada para screenshot real do painel */}
              <div className="relative border-t" style={{ borderColor: "var(--border)" }}>
                <Image
                  src="/placeholder-membros-painel.svg"
                  alt="Screenshot do painel de membros mostrando lista com filtros, buscas e cards de perfil com histórico de presença e grupos"
                  width={640}
                  height={160}
                  className="w-full"
                  style={{ display: "block", opacity: 0.6 }}
                  priority={false}
                />
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ background: "linear-gradient(to bottom, transparent 40%, var(--surface))" }}
                >
                  <span
                    className="font-mono text-[10px] uppercase tracking-[.12em] px-3 py-1.5 rounded-pill"
                    style={{ background: "var(--subtle)", color: "var(--muted)", border: "1px solid var(--border)" }}
                  >
                    Screenshot real em breve
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
