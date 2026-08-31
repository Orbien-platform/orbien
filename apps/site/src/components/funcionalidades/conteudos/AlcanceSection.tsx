import Image from "next/image";
import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";

const SEGMENTOS = [
  {
    label: "Todos os membros",
    desc: "Comunicados gerais, convocações e avisos urgentes para toda a base.",
    count: "247",
    unit: "membros",
    color: "var(--navy-accent)",
    bg: "var(--navy-dim)",
  },
  {
    label: "Pequeno grupo",
    desc: "Material de estudo, aviso de local ou horário para um grupo específico.",
    count: "12",
    unit: "membros",
    color: "#00B8A2",
    bg: "var(--teal-dim)",
  },
  {
    label: "Ministério ou cargo",
    desc: "Músicos, líderes de célula, voluntários — sem criar grupos de WhatsApp.",
    count: "18",
    unit: "líderes",
    color: "var(--stone)",
    bg: "var(--subtle)",
  },
] as const;

export function AlcanceSection() {
  return (
    <section className="py-20 md:py-24" style={{ background: "var(--subtle)" }}>
      <div className="mx-auto max-w-[1180px] px-6">
        <div className="grid grid-cols-1 gap-14 items-center md:grid-cols-[1fr_1fr] md:gap-16">
          {/* Left — text */}
          <Reveal>
            <SectionLabel className="mb-[18px]">Segmentação</SectionLabel>
            <h2
              className="font-medium tracking-[-0.025em] mb-5"
              style={{ fontSize: "clamp(28px, 3.8vw, 42px)", lineHeight: 1.1, color: "var(--ink)" }}
            >
              A mensagem certa para quem precisa ver.
            </h2>
            <p className="text-[16px] font-light leading-relaxed mb-8 max-w-[460px]" style={{ color: "var(--stone)" }}>
              Chega de mensagens irrelevantes que ninguém abre. Você define o público antes de publicar — e o app entrega só para quem importa.
            </p>

            <div className="flex flex-col gap-4">
              {SEGMENTOS.map(({ label, desc, count, unit, color, bg }) => (
                <div
                  key={label}
                  className="flex items-start gap-4 rounded-card border p-5"
                  style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                >
                  <div
                    className="rounded-btn px-3 py-2 text-center flex-shrink-0"
                    style={{ background: bg, minWidth: "52px" }}
                  >
                    <p className="font-mono text-[14px] font-semibold leading-none" style={{ color }}>{count}</p>
                    <p className="font-mono text-[8px] mt-0.5" style={{ color }}>{unit}</p>
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold mb-0.5" style={{ color: "var(--ink)" }}>{label}</p>
                    <p className="text-[13px] font-light leading-snug" style={{ color: "var(--stone)" }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

          {/* Right — compose mockup + image placeholder */}
          <Reveal>
            <div
              className="rounded-[14px] overflow-hidden border"
              style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-md)" }}
            >
              {/* Compose header */}
              <div
                className="px-5 py-4 border-b"
                style={{ background: "var(--subtle)", borderColor: "var(--border)" }}
              >
                <p className="font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--muted)" }}>
                  Novo comunicado
                </p>
              </div>

              {/* Form fields */}
              <div className="px-5 py-5 flex flex-col gap-4">
                {/* Audience selector */}
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[.08em] mb-2" style={{ color: "var(--muted)" }}>Público</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: "Todos", active: true  },
                      { label: "Líderes", active: false },
                      { label: "Célula Alfa", active: false },
                    ].map(({ label, active }) => (
                      <span
                        key={label}
                        className="font-mono text-[11px] font-medium px-3 py-1.5 rounded-pill border cursor-pointer"
                        style={{
                          background: active ? "var(--navy-accent)" : "var(--surface)",
                          color: active ? "#fff" : "var(--stone)",
                          borderColor: active ? "var(--navy-accent)" : "var(--border)",
                        }}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Type selector */}
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[.08em] mb-2" style={{ color: "var(--muted)" }}>Tipo</p>
                  <div className="flex gap-2">
                    {[
                      { label: "Aviso", active: true  },
                      { label: "Devocional", active: false },
                      { label: "Oração", active: false },
                    ].map(({ label, active }) => (
                      <span
                        key={label}
                        className="font-mono text-[11px] px-3 py-1.5 rounded-pill border"
                        style={{
                          background: active ? "var(--navy-tint)" : "var(--surface)",
                          color: active ? "var(--navy-accent)" : "var(--stone)",
                          borderColor: active ? "var(--navy-accent)" : "var(--border)",
                        }}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Message preview area */}
                <div
                  className="rounded-btn border p-3.5 text-[13px] font-light"
                  style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--stone)", minHeight: "80px" }}
                >
                  <p style={{ color: "var(--ink)" }}>Culto de quarta transferido para as 20h</p>
                  <p className="mt-1" style={{ color: "var(--stone)" }}>Prezados irmãos, nesta semana o culto de quarta-feira...</p>
                </div>

                {/* Send row */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: "var(--teal-dim)", color: "#00B8A2" }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                    <span className="font-mono text-[11px]" style={{ color: "var(--stone)" }}>247 destinatários</span>
                  </div>
                  <span
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-btn text-[12px] font-medium text-white"
                    style={{ background: "var(--navy-accent)" }}
                  >
                    Publicar agora
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                    </svg>
                  </span>
                </div>
              </div>

              {/* next/image placeholder para screenshot real do painel de conteúdo */}
              <div className="relative border-t" style={{ borderColor: "var(--border)" }}>
                <Image
                  src="/placeholder-membros-painel.svg"
                  alt="Screenshot do painel de publicação de conteúdo mostrando histórico de comunicados enviados com métricas de abertura e data de publicação"
                  width={640}
                  height={100}
                  className="w-full"
                  style={{ display: "block", opacity: 0.35 }}
                  priority={false}
                />
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ background: "linear-gradient(to bottom, transparent 20%, var(--surface))" }}
                >
                  <span
                    className="font-mono text-[10px] uppercase tracking-[.12em] px-3 py-1.5 rounded-pill"
                    style={{ background: "var(--subtle)", color: "var(--muted)", border: "1px solid var(--border)" }}
                  >
                    Histórico de publicações · em breve
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
