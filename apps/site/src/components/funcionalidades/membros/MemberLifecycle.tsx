import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";

const STAGES = [
  {
    badge: "Visitante",
    badgeBg: "var(--subtle)",
    badgeColor: "var(--stone)",
    borderColor: "var(--border)",
    dotColor: "var(--muted)",
    title: "Primeiro contato",
    body: "1ª a 3ª visita. O sistema registra presença e emite alerta pro responsável de boas-vindas no mesmo dia.",
    criteria: "Entrada: presença registrada pelo QR code",
  },
  {
    badge: "Frequentador",
    badgeBg: "var(--navy-dim)",
    badgeColor: "var(--navy-accent)",
    borderColor: "var(--navy-accent)",
    dotColor: "var(--navy-accent)",
    title: "Engajamento crescente",
    body: "Voltou. Está engajando. O sistema sugere convite para célula e o líder recebe a notificação automaticamente.",
    criteria: "Entrada: 3+ visitas em 30 dias",
  },
  {
    badge: "Membro",
    badgeBg: "var(--teal-dim)",
    badgeColor: "#00B8A2",
    borderColor: "#00B8A2",
    dotColor: "#00B8A2",
    title: "Filiação confirmada",
    body: "Filiação validada pela liderança. Acesso pleno ao app, histórico, grupos e histórico de contribuições.",
    criteria: "Entrada: confirmação manual pela liderança",
  },
] as const;

export function MemberLifecycle() {
  return (
    <section className="py-20 md:py-24" style={{ background: "var(--subtle)" }}>
      <div className="mx-auto max-w-[1180px] px-6">
        <Reveal className="mb-14">
          <SectionLabel className="mb-[18px]">Ciclo de vida</SectionLabel>
          <h2
            className="font-medium tracking-[-0.025em] mb-3.5"
            style={{ fontSize: "clamp(30px, 4.2vw, 44px)", lineHeight: 1.1, color: "var(--ink)" }}
          >
            Três estágios. Um fluxo automático.
          </h2>
          <p className="text-[17px] font-light leading-relaxed max-w-[560px]" style={{ color: "var(--stone)" }}>
            O sistema acompanha cada pessoa e reclassifica conforme o engajamento — você só valida a filiação final.
          </p>
        </Reveal>

        {/* Stage cards + connectors */}
        <Reveal>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
            {STAGES.map(({ badge, badgeBg, badgeColor, borderColor, dotColor, title, body, criteria }, i) => (
              <>
                <div
                  key={badge}
                  className="rounded-card border-2 p-7 flex flex-col gap-4"
                  style={{ background: "var(--surface)", borderColor }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: dotColor, boxShadow: `0 0 0 3px color-mix(in srgb, ${dotColor} 20%, transparent)` }}
                    />
                    <span
                      className="font-mono text-[11px] font-medium px-2.5 py-1 rounded-pill"
                      style={{ background: badgeBg, color: badgeColor }}
                    >
                      {badge}
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
                  <div
                    className="mt-auto pt-4 border-t font-mono text-[10px] leading-snug"
                    style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                  >
                    {criteria}
                  </div>
                </div>

                {/* Arrow connector — hidden on mobile */}
                {i < STAGES.length - 1 && (
                  <div key={`arrow-${i}`} className="hidden md:flex items-center justify-center px-1">
                    <svg
                      width="28" height="28" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                      style={{ color: "var(--border-strong)" }}
                    >
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </div>
                )}
              </>
            ))}
          </div>
        </Reveal>

        <Reveal>
          <div
            className="mt-5 flex items-start gap-3 rounded-[10px] px-5 py-4 text-[13.5px] leading-[1.55]"
            style={{ background: "var(--sand)", color: "var(--stone)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-px" style={{ color: "var(--navy-accent)" }}>
              <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
            </svg>
            A reclassificação de Visitante para Frequentador é automática. A filiação como{" "}
            <strong className="font-medium" style={{ color: "var(--ink)" }}>Membro</strong>{" "}
            sempre requer confirmação manual da liderança — nunca acontece sem intenção.
          </div>
        </Reveal>
      </div>
    </section>
  );
}
