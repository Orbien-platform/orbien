import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";

const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: "Membros e visitantes",
    body: "Cadastre um visitante em 30 segundos pelo QR code. Acompanhe quem voltou na semana seguinte.",
    note: "Incluído no Starter",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
        <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
        <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
      </svg>
    ),
    title: "Doações via PIX",
    body: "Chave PIX configurada por você. Recibo automático para o doador. Relatório semanal pronto para a tesoureira.",
    note: "Sem taxa sobre doações",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" />
        <path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" />
      </svg>
    ),
    title: "Pequenos grupos",
    body: "Materiais agendados, semáforo de saúde da célula e notificação automática pro líder antes de cada reunião.",
    note: "Incluído no Starter",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
    title: "Avisos e devocionais",
    body: "Notificações push, agenda de eventos e devocionais diários no app. Os membros ficam conectados entre os cultos.",
    note: "Incluído no Starter",
  },
] as const;

export function StarterIncludes() {
  return (
    <section className="py-20 md:py-24" style={{ background: "var(--subtle)" }}>
      <div className="mx-auto max-w-[1180px] px-6">
        <Reveal className="mb-12">
          <SectionLabel className="mb-[18px]">Plano Starter</SectionLabel>
          <h2
            className="font-medium tracking-[-0.025em] mb-3.5"
            style={{ fontSize: "clamp(30px, 4.2vw, 44px)", lineHeight: 1.1, color: "var(--ink)" }}
          >
            O que está incluído sem CNPJ.
          </h2>
          <p className="text-[17px] font-light leading-relaxed max-w-[560px]" style={{ color: "var(--stone)" }}>
            Quatro módulos que cobrem o que sua igreja faz toda semana — disponíveis desde o primeiro dia, sem exigência de formalização.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FEATURES.map(({ icon, title, body, note }) => (
            <Reveal key={title}>
              <div
                className="card-hover rounded-card border p-7 h-full flex flex-col gap-3.5"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5">
                    <div
                      className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0"
                      style={{ background: "var(--teal-dim)", color: "#00B8A2" }}
                    >
                      {icon}
                    </div>
                    <h3 className="text-[16px] font-semibold tracking-[-0.015em]" style={{ color: "var(--ink)" }}>
                      {title}
                    </h3>
                  </div>
                </div>
                <p className="flex-1 text-sm font-light leading-relaxed" style={{ color: "var(--stone)" }}>
                  {body}
                </p>
                <span
                  className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[.08em] w-fit px-2.5 py-1 rounded-pill"
                  style={{ background: "var(--teal-dim)", color: "#00B8A2" }}
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {note}
                </span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
