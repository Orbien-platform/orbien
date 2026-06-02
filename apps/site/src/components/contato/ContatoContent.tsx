import { SectionLabel } from "@/components/ui/SectionLabel";

const WA_HREF =
  "https://wa.me/5554999529683?text=Oi!%20Vim%20do%20site%20da%20Orbien%20e%20queria%20entender%20melhor%20como%20funciona%20pra%20minha%20igreja.";

function WhatsAppIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

export function ContatoContent() {
  return (
    <section className="flex-1 py-20 md:py-28">
      <div className="mx-auto max-w-[1180px] px-6">
        <div className="max-w-[560px]">
          <SectionLabel className="mb-7">Contato</SectionLabel>

          <h1
            className="font-light tracking-[-0.035em] mb-5"
            style={{ fontSize: "clamp(38px, 6vw, 60px)", lineHeight: 1.04, color: "var(--ink)" }}
          >
            Fale com a{" "}
            <strong className="font-semibold" style={{ color: "var(--navy-accent)" }}>
              gente.
            </strong>
          </h1>

          <p
            className="font-light leading-[1.6] mb-10 max-w-[460px]"
            style={{ fontSize: "clamp(16px, 1.6vw, 18px)", color: "var(--stone)" }}
          >
            Sem formulário, sem fila de suporte. Uma conversa direta pelo WhatsApp — a gente responde no mesmo dia.
          </p>

          {/* Primary CTA */}
          <a
            href={WA_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 rounded-btn px-7 py-4 text-[16px] font-medium text-white transition-all hover:-translate-y-px"
            style={{ background: "#25D366", boxShadow: "0 4px 20px rgba(37,211,102,.3)" }}
          >
            <WhatsAppIcon />
            Abrir conversa no WhatsApp
          </a>

          {/* Meta */}
          <div
            className="flex flex-wrap gap-x-8 gap-y-3 mt-8 pt-8 border-t font-mono text-[11.5px] tracking-[.06em]"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
          >
            <span className="flex items-center gap-2">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              Segunda a sexta, 9h às 18h
            </span>
            <span className="flex items-center gap-2">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
              </svg>
              Passo Fundo, RS
            </span>
          </div>
        </div>

        {/* Secondary card — demo */}
        <div
          className="mt-14 max-w-[560px] rounded-[14px] border p-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div className="flex-1">
            <p className="text-[15px] font-semibold mb-1" style={{ color: "var(--ink)" }}>
              Prefere agendar uma demonstração?
            </p>
            <p className="text-[13.5px] font-light" style={{ color: "var(--stone)" }}>
              Reservamos 30 minutos para mostrar a Orbien rodando com o cenário da sua igreja.
            </p>
          </div>
          {/* TODO: replace href with real scheduling link (Calendly / Cal.com) */}
          <a
            href="#"
            className="inline-flex items-center gap-2 h-10 rounded-btn border px-5 text-[13px] font-medium whitespace-nowrap transition-all hover:-translate-y-px flex-shrink-0"
            style={{ color: "var(--navy-accent)", borderColor: "var(--navy-accent)" }}
          >
            Agendar demo
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
