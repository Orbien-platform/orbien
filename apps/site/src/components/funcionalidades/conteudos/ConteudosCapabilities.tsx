import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";

const CAPABILITIES = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
    title: "Agenda de eventos",
    body: "Cultos, retiros, aniversários e conferências no calendário do app. O membro adiciona ao Google Agenda com um toque.",
    plan: "Starter e Premium",
    planColor: "#00B8A2",
    planBg: "var(--teal-dim)",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    title: "Mensagem da liderança",
    body: "O pastor envia uma mensagem direta para todos ou para um segmento. Aparece destacada no topo do feed do membro.",
    plan: "Starter e Premium",
    planColor: "#00B8A2",
    planBg: "var(--teal-dim)",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
    title: "Segmentação de público",
    body: "Envie para todos, para um grupo específico, para líderes ou para membros de um ministério. A mensagem certa para a pessoa certa.",
    plan: "Starter e Premium",
    planColor: "#00B8A2",
    planBg: "var(--teal-dim)",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    title: "Métricas de leitura",
    body: "Quantos membros abriram o aviso, quantos leram o devocional até o fim. O pastor sabe o que engaja a comunidade.",
    plan: "Somente Premium",
    planColor: "var(--navy-accent)",
    planBg: "var(--navy-dim)",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
        <path d="M4.93 4.93l14.14 14.14" />
      </svg>
    ),
    title: "Modo silencioso por horário",
    body: "Notificações são bloqueadas automaticamente entre 22h e 7h — para respeitar o descanso dos membros sem precisar de configuração individual.",
    plan: "Starter e Premium",
    planColor: "#00B8A2",
    planBg: "var(--teal-dim)",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
    title: "Identidade visual da igreja",
    body: "O conteúdo aparece com o logo, as cores e o nome da sua igreja no app. O membro não vê \"Orbien\" — vê \"Igreja da Graça\".",
    plan: "Starter e Premium",
    planColor: "#00B8A2",
    planBg: "var(--teal-dim)",
  },
] as const;

export function ConteudosCapabilities() {
  return (
    <section className="py-20 md:py-24">
      <div className="mx-auto max-w-[1180px] px-6">
        <Reveal className="mb-12">
          <SectionLabel className="mb-[18px]">Recursos</SectionLabel>
          <h2
            className="font-medium tracking-[-0.025em] mb-3.5"
            style={{ fontSize: "clamp(30px, 4.2vw, 44px)", lineHeight: 1.1, color: "var(--ink)" }}
          >
            Comunicação que a comunidade abre.
          </h2>
          <p className="text-[17px] font-light leading-relaxed max-w-[580px]" style={{ color: "var(--stone)" }}>
            Seis recursos para a liderança comunicar com clareza — e para o membro se sentir parte da comunidade o dia todo.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {CAPABILITIES.map(({ icon, title, body, plan, planColor, planBg }) => (
            <Reveal key={title}>
              <div
                className="card-hover rounded-card border p-7 h-full flex flex-col gap-4"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                <div
                  className="w-11 h-11 rounded-[10px] flex items-center justify-center flex-shrink-0"
                  style={{ background: "var(--navy-tint)", color: "var(--navy-accent)" }}
                >
                  {icon}
                </div>
                <div className="flex flex-col gap-2 flex-1">
                  <h3 className="text-[16px] font-semibold tracking-[-0.018em]" style={{ color: "var(--ink)" }}>
                    {title}
                  </h3>
                  <p className="flex-1 text-[14px] font-light leading-relaxed" style={{ color: "var(--stone)" }}>
                    {body}
                  </p>
                </div>
                <span
                  className="font-mono text-[10px] font-medium px-2.5 py-1 rounded-pill w-fit"
                  style={{ background: planBg, color: planColor }}
                >
                  {plan}
                </span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
