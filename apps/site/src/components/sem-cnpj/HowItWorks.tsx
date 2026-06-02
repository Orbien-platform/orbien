import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";

const STEPS = [
  {
    step: "01",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18" />
        <path d="M9 21V9" />
      </svg>
    ),
    title: "Crie sua conta em 5 minutos",
    body: "Nome da igreja e telefone — pronto. Sem CNPJ, sem cartão de crédito. Você configura tudo antes de precisar decidir qualquer coisa.",
  },
  {
    step: "02",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
        <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
        <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
      </svg>
    ),
    title: "Configure sua chave PIX",
    body: "CPF do pastor, telefone ou e-mail da igreja. As doações caem direto pra você — a Orbien não é intermediária e não toca em nenhum centavo.",
  },
  {
    step: "03",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
    title: "Sua igreja já está no ar",
    body: "Painel administrativo, app para os membros e relatórios financeiros prontos. Convide sua secretária — ela aprende em uma tarde.",
  },
] as const;

export function HowItWorks() {
  return (
    <section className="py-20 md:py-24" style={{ background: "var(--subtle)" }}>
      <div className="mx-auto max-w-[1180px] px-6">
        <Reveal className="mb-14">
          <SectionLabel className="mb-[18px]">Como funciona</SectionLabel>
          <h2
            className="font-medium tracking-[-0.025em] mb-3.5"
            style={{ fontSize: "clamp(30px, 4.2vw, 44px)", lineHeight: 1.1, color: "var(--ink)" }}
          >
            Três passos e sua igreja está no ar.
          </h2>
          <p className="text-[17px] font-light leading-relaxed max-w-[540px]" style={{ color: "var(--stone)" }}>
            Sem burocracia de CNPJ, sem integração bancária, sem treinamento longo.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {STEPS.map(({ step, icon, title, body }) => (
            <Reveal key={step}>
              <div
                className="card-hover rounded-card border p-7 h-full relative"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                {/* Step number */}
                <div
                  className="font-mono text-[11px] font-medium tracking-[.1em] mb-5"
                  style={{ color: "var(--navy-accent)" }}
                >
                  {step}
                </div>
                <div
                  className="w-11 h-11 rounded-[10px] flex items-center justify-center mb-5"
                  style={{ background: "var(--navy-tint)", color: "var(--navy-accent)" }}
                >
                  {icon}
                </div>
                <h3 className="text-[17px] font-semibold tracking-[-0.018em] mb-2.5" style={{ color: "var(--ink)" }}>
                  {title}
                </h3>
                <p className="text-[14.5px] font-light leading-relaxed" style={{ color: "var(--stone)" }}>
                  {body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
