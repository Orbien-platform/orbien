import Link from "next/link";
import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";

const MODULES = [
  {
    href: "/funcionalidades/membros",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: "Membros e visitantes",
    body: "Cadastre um visitante em 30 segundos pelo QR code. Acompanhe quem voltou.",
  },
  {
    href: "/funcionalidades/financeiro",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
        <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
        <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
      </svg>
    ),
    title: "Doações e finanças",
    body: "PIX, recibo automático e relatório semanal. Pronto pra contabilidade.",
  },
  {
    href: "/funcionalidades/pequenos-grupos",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" />
        <path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" />
      </svg>
    ),
    title: "Pequenos grupos",
    body: "Materiais agendados, semáforo de saúde da célula, notificação automática pro líder.",
  },
  {
    href: "/funcionalidades/conteudos",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
    title: "Conteúdo e notificações",
    body: "Avisos, devocionais e mensagens da liderança no app da sua igreja.",
  },
] as const;

const ArrowRight = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
  </svg>
);

export function Modules() {
  return (
    <section className="pb-20 md:pb-24" id="modulos">
      <div className="mx-auto max-w-[1180px] px-6">
        <Reveal className="mb-12">
          <SectionLabel className="mb-[18px]">Funcionalidades</SectionLabel>
          <h2
            className="font-medium tracking-[-0.025em] mb-3.5"
            style={{ fontSize: "clamp(30px, 4.2vw, 44px)", lineHeight: 1.1, color: "var(--ink)" }}
          >
            O dia a dia, simplificado.
          </h2>
          <p className="text-[17px] font-light leading-relaxed max-w-[620px]" style={{ color: "var(--stone)" }}>
            Quatro módulos que cobrem o que sua igreja faz toda semana.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {MODULES.map(({ href, icon, title, body }) => (
            <Reveal key={title}>
              <Link
                href={href}
                className="card-hover-navy group flex flex-col gap-3.5 rounded-card border p-7 h-full"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0"
                    style={{ background: "var(--teal-dim)", color: "#00B8A2" }}
                  >
                    {icon}
                  </div>
                  <h3 className="text-[17px] font-semibold tracking-[-0.015em]" style={{ color: "var(--ink)" }}>
                    {title}
                  </h3>
                </div>
                <p className="flex-1 text-sm font-light leading-relaxed" style={{ color: "var(--stone)" }}>
                  {body}
                </p>
                <span
                  className="inline-flex items-center gap-1 text-[13px] font-medium transition-all group-hover:gap-2"
                  style={{ color: "var(--navy-accent)" }}
                >
                  Ver módulo <ArrowRight />
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
