import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";

const PRINCIPIOS = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    titulo: "Rigor sem frieza",
    corpo: "Precisão técnica não precisa ser fria. O produto é exato nos dados, direto na comunicação e bonito no visual — sem sacrificar um pelo outro. Precision Modern é nossa direção de design.",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    titulo: "Construído com pastores",
    corpo: "Nenhuma feature entra em produção sem ser validada com pelo menos um pastor usando no dia a dia real. Quem usa decide o que fica. Não temos product manager mais especialista do que o pastor da Doca Church.",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
      </svg>
    ),
    titulo: "Transparência radical",
    corpo: "Preço na tabela sem esconder funcionalidade. Taxa de PIX explícita por cenário. Dados da sua igreja no Brasil, sob a LGPD, com você como controlador. Sem surpresa no boleto do mês que vem.",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" />
      </svg>
    ),
    titulo: "Mobile-first, sempre",
    corpo: "O pastor usa no celular. A secretária usa no celular. O líder de célula usa no celular. A interface foi desenhada para o polegar, não para o mouse — cada tela, cada fluxo, cada notificação.",
  },
] as const;

export function PrincipiosSection() {
  return (
    <section
      className="py-20 md:py-24 border-t"
      style={{ background: "var(--subtle)", borderColor: "var(--border)" }}
    >
      <div className="mx-auto max-w-[1180px] px-6">
        <Reveal className="mb-14">
          <SectionLabel className="mb-[18px]">Como trabalhamos</SectionLabel>
          <h2
            className="font-medium tracking-[-0.025em] mb-3.5"
            style={{ fontSize: "clamp(30px, 4.2vw, 44px)", lineHeight: 1.1, color: "var(--ink)" }}
          >
            Quatro princípios que guiam tudo.
          </h2>
          <p className="text-[17px] font-light leading-relaxed max-w-[560px]" style={{ color: "var(--stone)" }}>
            Cada decisão de produto, design e negócio passa por esses filtros — do nome de uma variável CSS ao preço de um plano.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PRINCIPIOS.map(({ icon, titulo, corpo }) => (
            <Reveal key={titulo}>
              <div
                className="card-hover rounded-card border p-8 h-full flex flex-col gap-5"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                <div
                  className="w-12 h-12 rounded-[12px] flex items-center justify-center flex-shrink-0"
                  style={{ background: "var(--navy-tint)", color: "var(--navy-accent)" }}
                >
                  {icon}
                </div>
                <div>
                  <h3
                    className="text-[19px] font-semibold tracking-[-0.02em] mb-3"
                    style={{ color: "var(--ink)" }}
                  >
                    {titulo}
                  </h3>
                  <p className="text-[14.5px] font-light leading-[1.7]" style={{ color: "var(--stone)" }}>
                    {corpo}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
