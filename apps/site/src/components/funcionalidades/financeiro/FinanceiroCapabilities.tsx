import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";

const CAPABILITIES = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
      </svg>
    ),
    title: "Recibo automático",
    body: "Confirmado o PIX, o doador recebe o comprovante por e-mail ou WhatsApp — sem nenhuma ação da tesoureira.",
    plan: "Starter e Premium",
    planColor: "#00B8A2",
    planBg: "var(--teal-dim)",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" /><path d="M7 16V9" /><path d="M12 16v-5" /><path d="M17 16V7" />
      </svg>
    ),
    title: "Dashboard financeiro",
    body: "KPIs de arrecadação, percentual de dizimistas e comparativo com o mês anterior — visíveis em tempo real para o pastor e a tesoureira.",
    plan: "Starter e Premium",
    planColor: "#00B8A2",
    planBg: "var(--teal-dim)",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
    title: "Relatório semanal automático",
    body: "Todo início de semana, um resumo de entradas, saídas e doadores únicos chega por e-mail — sem ninguém precisar gerar nada.",
    plan: "Starter e Premium",
    planColor: "#00B8A2",
    planBg: "var(--teal-dim)",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
    title: "DRE, fluxo de caixa e forecast",
    body: "Demonstrativo de resultado, fluxo mensal e projeção para os próximos três meses. O pastor sabe quanto vai sobrar antes de autorizar qualquer despesa.",
    plan: "Somente Premium",
    planColor: "var(--navy-accent)",
    planBg: "var(--navy-dim)",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    ),
    title: "Exportação contábil",
    body: "Exporte em OFX e SPED — os formatos que o contador já usa. A prestação de contas para conselho ou auditoria sai em dois cliques.",
    plan: "Somente Premium",
    planColor: "var(--navy-accent)",
    planBg: "var(--navy-dim)",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 12V22H4V12" /><path d="M22 7H2v5h20V7z" /><path d="M12 22V7" />
        <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
        <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
      </svg>
    ),
    title: "Carnê do dizimista",
    body: "Gere o comprovante anual de contribuições para cada membro declarar no Imposto de Renda — entregue pelo app automaticamente em janeiro.",
    plan: "Somente Premium",
    planColor: "var(--navy-accent)",
    planBg: "var(--navy-dim)",
  },
] as const;

export function FinanceiroCapabilities() {
  return (
    <section className="py-20 md:py-24">
      <div className="mx-auto max-w-[1180px] px-6">
        <Reveal className="mb-12">
          <SectionLabel className="mb-[18px]">Recursos</SectionLabel>
          <h2
            className="font-medium tracking-[-0.025em] mb-3.5"
            style={{ fontSize: "clamp(30px, 4.2vw, 44px)", lineHeight: 1.1, color: "var(--ink)" }}
          >
            Do recibo ao balanço anual.
          </h2>
          <p className="text-[17px] font-light leading-relaxed max-w-[580px]" style={{ color: "var(--stone)" }}>
            Seis recursos que cobrem a gestão financeira da entrada de um dízimo até a prestação de contas para o conselho.
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
