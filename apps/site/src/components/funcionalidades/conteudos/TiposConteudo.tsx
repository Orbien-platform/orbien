import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";

const TIPOS = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
    color: "var(--navy-accent)",
    colorBg: "var(--navy-tint)",
    badge: "Avisos",
    badgeBg: "var(--navy-dim)",
    badgeColor: "var(--navy-accent)",
    title: "Comunicados e avisos",
    body: "A liderança publica um comunicado e todos os membros recebem notificação push — com ou sem o app aberto. Ideal para mudanças de horário, convocações e urgências.",
    details: [
      "Push imediato ou agendado",
      "Segmentação: todos, grupo ou ministério",
      "Confirmação de leitura opcional",
    ],
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
    color: "#00B8A2",
    colorBg: "var(--teal-dim)",
    badge: "Devocionais",
    badgeBg: "var(--teal-dim)",
    badgeColor: "#00B8A2",
    title: "Devocionais diários",
    body: "O pastor escreve (ou importa) o devocional do mês de uma vez. O sistema publica um por dia no app, com o horário que você escolher — sem precisar postar manualmente todo dia.",
    details: [
      "Programação mensal ou semanal",
      "Formato texto, áudio ou link de vídeo",
      "Histórico acessível no app",
    ],
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    ),
    color: "#C0392B",
    colorBg: "var(--crimson-dim)",
    badge: "Oração",
    badgeBg: "var(--crimson-dim)",
    badgeColor: "#C0392B",
    title: "Pedidos de oração",
    body: "O membro registra um pedido no app e a comunidade ora. A liderança pode marcar pedidos como respondidos — criando uma memória coletiva de fé da igreja.",
    details: [
      "Pedido público ou privado (só para liderança)",
      "Contador de quem está orando",
      "Notificação quando marcado como respondido",
    ],
  },
] as const;

export function TiposConteudo() {
  return (
    <section className="py-20 md:py-24" style={{ background: "var(--subtle)" }}>
      <div className="mx-auto max-w-[1180px] px-6">
        <Reveal className="mb-14">
          <SectionLabel className="mb-[18px]">Tipos de conteúdo</SectionLabel>
          <h2
            className="font-medium tracking-[-0.025em] mb-3.5"
            style={{ fontSize: "clamp(30px, 4.2vw, 44px)", lineHeight: 1.1, color: "var(--ink)" }}
          >
            Três canais. Uma só plataforma.
          </h2>
          <p className="text-[17px] font-light leading-relaxed max-w-[560px]" style={{ color: "var(--stone)" }}>
            Do aviso urgente ao devocional diário — tudo chega pelo app com a identidade visual da sua igreja.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {TIPOS.map(({ icon, color, colorBg, badge, badgeBg, badgeColor, title, body, details }) => (
            <Reveal key={badge}>
              <div
                className="card-hover rounded-card border p-7 h-full flex flex-col gap-5"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div
                    className="w-12 h-12 rounded-[12px] flex items-center justify-center flex-shrink-0"
                    style={{ background: colorBg, color }}
                  >
                    {icon}
                  </div>
                  <span
                    className="font-mono text-[10px] font-medium px-2.5 py-1 rounded-pill"
                    style={{ background: badgeBg, color: badgeColor }}
                  >
                    {badge}
                  </span>
                </div>

                <div>
                  <h3 className="text-[17px] font-semibold tracking-[-0.018em] mb-2.5" style={{ color: "var(--ink)" }}>
                    {title}
                  </h3>
                  <p className="text-[14px] font-light leading-relaxed" style={{ color: "var(--stone)" }}>
                    {body}
                  </p>
                </div>

                <div className="flex flex-col gap-2 mt-auto">
                  {details.map((d) => (
                    <div key={d} className="flex items-start gap-2">
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
                        style={{ background: color }}
                      />
                      <span className="text-[12.5px] font-light" style={{ color: "var(--stone)" }}>{d}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
