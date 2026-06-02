import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";

const ESTADOS = [
  {
    dot: "#22C55E",
    dotShadow: "rgba(34,197,94,.2)",
    label: "Verde — Saudável",
    labelColor: "#22C55E",
    labelBg: "rgba(34,197,94,.08)",
    title: "Grupo ativo e engajado",
    body: "Reuniões regulares, presença consistente e líder responsivo. Nenhuma ação necessária — o sistema só registra.",
    triggers: [
      "2+ reuniões no último mês",
      "Frequência acima de 60% dos membros",
      "Líder registrou presença em até 24h",
    ],
    pastor: null,
  },
  {
    dot: "#EAB308",
    dotShadow: "rgba(234,179,8,.2)",
    label: "Amarelo — Atenção",
    labelColor: "#92700A",
    labelBg: "rgba(234,179,8,.1)",
    title: "Sinais de enfraquecimento",
    body: "Frequência caindo ou reuniões irregulares. O sistema alerta o pastor e sugere uma conversa com o líder.",
    triggers: [
      "1 reunião no último mês",
      "Frequência entre 40% e 60%",
      "Presença não registrada por mais de 10 dias",
    ],
    pastor: "O pastor recebe alerta e pode atribuir um acompanhador ao grupo.",
  },
  {
    dot: "#C0392B",
    dotShadow: "rgba(192,57,43,.2)",
    label: "Vermelho — Inativo",
    labelColor: "#C0392B",
    labelBg: "var(--crimson-dim)",
    title: "Grupo parado",
    body: "Sem reuniões registradas no mês. Alerta imediato para o pastor — com sugestão de redistribuição de membros.",
    triggers: [
      "0 reuniões no último mês",
      "Frequência abaixo de 40% ou sem registros",
      "Líder sem atividade há 30+ dias",
    ],
    pastor: "Notificação push para o pastor com lista de membros do grupo e ação sugerida.",
  },
] as const;

export function SemaforoSaude() {
  return (
    <section className="py-20 md:py-24">
      <div className="mx-auto max-w-[1180px] px-6">
        <Reveal className="mb-14">
          <SectionLabel className="mb-[18px]">Semáforo de saúde</SectionLabel>
          <h2
            className="font-medium tracking-[-0.025em] mb-3.5"
            style={{ fontSize: "clamp(30px, 4.2vw, 44px)", lineHeight: 1.1, color: "var(--ink)" }}
          >
            O pastor sabe qual grupo está esfriando.
          </h2>
          <p className="text-[17px] font-light leading-relaxed max-w-[560px]" style={{ color: "var(--stone)" }}>
            Cada grupo recebe automaticamente um status baseado em frequência e regularidade de reuniões. Sem precisar perguntar para cada líder.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {ESTADOS.map(({ dot, dotShadow, label, labelColor, labelBg, title, body, triggers, pastor }) => (
            <Reveal key={label}>
              <div
                className="rounded-card border p-7 h-full flex flex-col gap-5"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                {/* Status badge */}
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ background: dot, boxShadow: `0 0 0 4px ${dotShadow}` }}
                  />
                  <span
                    className="font-mono text-[11px] font-medium px-2.5 py-1 rounded-pill"
                    style={{ background: labelBg, color: labelColor }}
                  >
                    {label}
                  </span>
                </div>

                <div>
                  <h3 className="text-[17px] font-semibold tracking-[-0.018em] mb-2" style={{ color: "var(--ink)" }}>
                    {title}
                  </h3>
                  <p className="text-[14px] font-light leading-relaxed" style={{ color: "var(--stone)" }}>
                    {body}
                  </p>
                </div>

                {/* Triggers */}
                <div className="flex flex-col gap-2">
                  <p className="font-mono text-[10px] uppercase tracking-[.1em] mb-1" style={{ color: "var(--muted)" }}>
                    Critérios
                  </p>
                  {triggers.map((t) => (
                    <div key={t} className="flex items-start gap-2">
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
                        style={{ background: dot }}
                      />
                      <span className="text-[12.5px] font-light" style={{ color: "var(--stone)" }}>{t}</span>
                    </div>
                  ))}
                </div>

                {pastor && (
                  <div
                    className="mt-auto pt-4 border-t text-[12.5px] font-light leading-snug flex items-start gap-2"
                    style={{ borderColor: "var(--border)", color: "var(--stone)" }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-px" style={{ color: labelColor }}>
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                    {pastor}
                  </div>
                )}
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <div
            className="mt-5 flex items-start gap-3 rounded-[10px] px-5 py-4 text-[13.5px] leading-[1.55]"
            style={{ background: "var(--sand)", color: "var(--stone)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-px" style={{ color: "var(--navy-accent)" }}>
              <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
            </svg>
            O semáforo de saúde está disponível no{" "}
            <strong className="font-medium" style={{ color: "var(--ink)" }}>plano Premium</strong>.
            {" "}No Starter, o pastor acessa o cadastro e os materiais dos grupos, mas sem o indicador automático de saúde.
          </div>
        </Reveal>
      </div>
    </section>
  );
}
