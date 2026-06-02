import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";

const CAPABILITIES = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
    title: "Materiais agendados",
    body: "Carregue os estudos bíblicos do trimestre de uma vez. O sistema libera cada material na data certa para o líder e os membros do grupo.",
    plan: "Starter e Premium",
    planColor: "#00B8A2",
    planBg: "var(--teal-dim)",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
    title: "Notificação automática",
    body: "O líder recebe uma notificação push no dia da reunião com o material do encontro e a lista de presença para registrar.",
    plan: "Starter e Premium",
    planColor: "#00B8A2",
    planBg: "var(--teal-dim)",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: "Registro de presença mobile",
    body: "O líder marca os presentes pelo celular, no mesmo dia, direto do app. O histórico aparece no painel da secretária em tempo real.",
    plan: "Starter e Premium",
    planColor: "#00B8A2",
    planBg: "var(--teal-dim)",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </svg>
    ),
    title: "Semáforo de saúde",
    body: "Verde, amarelo ou vermelho para cada grupo — calculado automaticamente por frequência e regularidade. O pastor vê tudo em um painel.",
    plan: "Somente Premium",
    planColor: "var(--navy-accent)",
    planBg: "var(--navy-dim)",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    title: "Sugestão de convite",
    body: "Quando um visitante frequenta mais de duas vezes sem célula, o sistema sugere um convite para o grupo mais próximo do perfil dele.",
    plan: "Starter e Premium",
    planColor: "#00B8A2",
    planBg: "var(--teal-dim)",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M4.93 4.93a10 10 0 0 0 0 14.14" />
      </svg>
    ),
    title: "Terminologia configurável",
    body: "Célula, pequeno grupo, EBD, ministério, discipulado — você define como a sua tradição chama. O sistema adapta todos os textos e notificações.",
    plan: "Starter e Premium",
    planColor: "#00B8A2",
    planBg: "var(--teal-dim)",
  },
] as const;

export function PGCapabilities() {
  return (
    <section className="py-20 md:py-24" style={{ background: "var(--subtle)" }}>
      <div className="mx-auto max-w-[1180px] px-6">
        <Reveal className="mb-12">
          <SectionLabel className="mb-[18px]">Recursos do módulo</SectionLabel>
          <h2
            className="font-medium tracking-[-0.025em] mb-3.5"
            style={{ fontSize: "clamp(30px, 4.2vw, 44px)", lineHeight: 1.1, color: "var(--ink)" }}
          >
            Tudo para o líder focar na reunião.
          </h2>
          <p className="text-[17px] font-light leading-relaxed max-w-[580px]" style={{ color: "var(--stone)" }}>
            Seis recursos que tiram da cabeça do líder a logística de material, presença e comunicação — e deixam ele pensar só nas pessoas.
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
