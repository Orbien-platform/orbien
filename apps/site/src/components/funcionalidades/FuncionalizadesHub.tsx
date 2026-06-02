import Link from "next/link";
import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";

const MODULES = [
  {
    href: "/funcionalidades/membros",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: "Membros e visitantes",
    body: "Cadastre em 30 segundos pelo QR code. Acompanhe o ciclo de vida completo — do primeiro contato à filiação — sem planilha.",
    highlights: ["QR code na entrada", "Deduplicação inteligente", "Semáforo de presença"],
  },
  {
    href: "/funcionalidades/financeiro",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
        <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
        <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
      </svg>
    ),
    title: "Financeiro",
    body: "PIX com recibo automático, dízimo recorrente e relatório semanal sem trabalho manual. Do Starter ao balanço anual para o conselho.",
    highlights: ["PIX sem taxa no Starter", "Dízimo automático", "Exportação contábil"],
  },
  {
    href: "/funcionalidades/pequenos-grupos",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" />
        <path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" />
      </svg>
    ),
    title: "Pequenos grupos",
    body: "Materiais agendados, notificação automática pro líder e semáforo verde/amarelo/vermelho por grupo. O pastor sabe qual célula está esfriando.",
    highlights: ["Semáforo de saúde", "Registro mobile pelo líder", "Materiais agendados"],
  },
  {
    href: "/funcionalidades/conteudos",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
    title: "Conteúdos e notificações",
    body: "Avisos push, devocionais programados e pedidos de oração no app com a cara da sua igreja. A comunidade conectada entre os cultos.",
    highlights: ["Push segmentado", "Devocionais diários", "Pedidos de oração"],
  },
] as const;

export function FuncionalizadesHub() {
  return (
    <>
      {/* Hero */}
      <section className="pt-20 pb-16 md:pt-28 md:pb-20">
        <div className="mx-auto max-w-[1180px] px-6">
          <SectionLabel className="mb-7">Funcionalidades</SectionLabel>
          <h1
            className="font-light tracking-[-0.035em] mb-6"
            style={{ fontSize: "clamp(40px, 6.5vw, 72px)", lineHeight: 1.04, color: "var(--ink)" }}
          >
            Uma plataforma.{" "}
            <strong className="font-semibold" style={{ color: "var(--navy-accent)" }}>
              Quatro módulos.
            </strong>
          </h1>
          <p
            className="font-light leading-[1.6] max-w-[580px]"
            style={{ fontSize: "clamp(17px, 1.8vw, 19px)", color: "var(--stone)" }}
          >
            Quatro módulos que cobrem o que sua igreja faz toda semana — sem integração, sem silos, sem planilha paralela.
          </p>
        </div>
      </section>

      {/* Module cards */}
      <section className="pb-24 md:pb-28">
        <div className="mx-auto max-w-[1180px] px-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {MODULES.map(({ href, icon, title, body, highlights }) => (
              <Reveal key={href}>
                <Link
                  href={href}
                  className="card-hover-navy group rounded-[16px] border p-8 h-full flex flex-col gap-6"
                  style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                >
                  {/* Icon */}
                  <div
                    className="w-14 h-14 rounded-[14px] flex items-center justify-center flex-shrink-0"
                    style={{ background: "var(--navy-tint)", color: "var(--navy-accent)" }}
                  >
                    {icon}
                  </div>

                  {/* Text */}
                  <div className="flex-1 flex flex-col gap-3">
                    <h2
                      className="text-[21px] font-semibold tracking-[-0.02em]"
                      style={{ color: "var(--ink)" }}
                    >
                      {title}
                    </h2>
                    <p className="text-[14.5px] font-light leading-relaxed" style={{ color: "var(--stone)" }}>
                      {body}
                    </p>
                  </div>

                  {/* Highlights */}
                  <div className="flex flex-wrap gap-2">
                    {highlights.map((h) => (
                      <span
                        key={h}
                        className="font-mono text-[10px] px-2.5 py-1 rounded-pill"
                        style={{ background: "var(--navy-dim)", color: "var(--navy-accent)" }}
                      >
                        {h}
                      </span>
                    ))}
                  </div>

                  {/* CTA */}
                  <span
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-all group-hover:gap-2.5"
                    style={{ color: "var(--navy-accent)" }}
                  >
                    Ver módulo
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                    </svg>
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
