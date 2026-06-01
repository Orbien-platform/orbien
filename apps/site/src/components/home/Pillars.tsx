import { Reveal } from "@/components/ui/Reveal";

const PILLARS = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 4h3a2 2 0 0 1 2 2v14" /><path d="M2 20h3" /><path d="M13 20h9" />
        <path d="M10 12v.01" />
        <path d="M13 4.562v16.157a1 1 0 0 1-1.242.97L5.762 20.2a2 2 0 0 1-1.762-2V5.821a2 2 0 0 1 1.276-1.864l5-1.815A1 1 0 0 1 13 3.066Z" />
      </svg>
    ),
    title: "Sua igreja entra hoje.",
    body: "Sem CNPJ, sem instalação, sem treinamento. O cadastro leva 5 minutos e a sua secretária aprende em uma tarde.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
        <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
        <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
        <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
      </svg>
    ),
    title: "O app é seu, não nosso.",
    body: "Logo da sua igreja, cores da sua igreja, nome da sua igreja. No Premium, o app vai para as lojas com domínio próprio.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" /><path d="M7 16V9" /><path d="M12 16v-5" /><path d="M17 16V7" />
      </svg>
    ),
    title: "Você vê o que está acontecendo.",
    body: "Quantos visitantes voltaram, quanto entrou esta semana, qual célula está esfriando. Em painéis simples, atualizados em tempo real.",
  },
] as const;

export function Pillars() {
  return (
    <section className="py-20 md:py-24" id="pilares">
      <div className="mx-auto max-w-[1180px] px-6">
        <Reveal className="mb-12">
          <p
            className="inline-flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[.14em] mb-[18px]"
            style={{ color: "var(--navy-accent)" }}
          >
            <span className="w-6 h-px" style={{ background: "var(--navy-accent)" }} />
            Por que Orbien
          </p>
          <h2
            className="font-medium tracking-[-0.025em] mb-3.5"
            style={{ fontSize: "clamp(30px, 4.2vw, 44px)", lineHeight: 1.1, color: "var(--ink)" }}
          >
            Três motivos para a sua igreja começar hoje.
          </h2>
          <p className="text-[17px] font-light leading-relaxed max-w-[620px]" style={{ color: "var(--stone)" }}>
            Igrejas de 50 a 300 membros merecem uma plataforma moderna — sem complexidade enterprise, sem fricção de CNPJ, sem dashboard de banco.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {PILLARS.map(({ icon, title, body }) => (
            <Reveal key={title}>
              <div
                className="card-hover rounded-card border p-7 h-full"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--border)",
                }}
              >
                <div
                  className="w-11 h-11 rounded-[10px] flex items-center justify-center mb-5"
                  style={{ background: "var(--navy-tint)", color: "var(--navy-accent)" }}
                >
                  {icon}
                </div>
                <h3 className="text-xl font-semibold tracking-[-0.02em] mb-2.5" style={{ color: "var(--ink)" }}>
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
