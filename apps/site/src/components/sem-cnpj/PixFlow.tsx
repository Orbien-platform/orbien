import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";

function FlowDiagram() {
  return (
    <div className="relative flex flex-col gap-3">
      {/* Member node */}
      <div
        className="flex items-center gap-3.5 rounded-card border p-4"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-sm)" }}
      >
        <div
          className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0"
          style={{ background: "var(--subtle)", color: "var(--navy-accent)" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <div>
          <p className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>Membro faz doação</p>
          <p className="font-mono text-[10px] mt-0.5" style={{ color: "var(--muted)" }}>via PIX · qualquer banco</p>
        </div>
        <span
          className="ml-auto font-mono text-[11px] font-medium"
          style={{ color: "#00B8A2" }}
        >
          R$ 150,00
        </span>
      </div>

      {/* Arrow down */}
      <div className="flex items-center justify-center gap-3">
        <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
        <div className="flex flex-col items-center gap-1">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--navy-accent)" }}>
            <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
          </svg>
          <span className="font-mono text-[9px] uppercase tracking-[.08em] whitespace-nowrap" style={{ color: "var(--muted)" }}>
            vai direto
          </span>
        </div>
        <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
      </div>

      {/* Church node — highlighted */}
      <div
        className="flex items-center gap-3.5 rounded-card border-2 p-4"
        style={{ background: "var(--navy-tint)", borderColor: "var(--navy-accent)" }}
      >
        <div
          className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0"
          style={{ background: "var(--navy-accent)", color: "#fff" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </div>
        <div>
          <p className="text-[13px] font-semibold" style={{ color: "var(--navy-accent)" }}>Chave PIX da Igreja</p>
          <p className="font-mono text-[10px] mt-0.5" style={{ color: "var(--navy-accent)", opacity: 0.7 }}>CPF · telefone · e-mail</p>
        </div>
        <span
          className="ml-auto font-mono text-[11px] font-medium px-2.5 py-1 rounded-pill"
          style={{ background: "var(--navy-accent)", color: "#fff" }}
        >
          ✓ recebido
        </span>
      </div>

      {/* Orbien bypass */}
      <div
        className="flex items-center gap-2.5 rounded-btn px-4 py-2.5 mt-1"
        style={{ background: "var(--teal-dim)", color: "#00B8A2" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <p className="text-[12px] font-medium">
          Orbien não intermediou — recibo gerado automaticamente
        </p>
      </div>
    </div>
  );
}

const GUARANTEES = [
  {
    title: "PIX cai direto na sua chave",
    body: "Você configura CPF, telefone ou e-mail como chave. O dinheiro vai pra lá, sem passar por nenhuma conta da Orbien.",
  },
  {
    title: "Recibo automático para o doador",
    body: "Assim que o PIX confirma, o doador recebe o comprovante. Nenhum trabalho manual pra você.",
  },
  {
    title: "Orbien não é intermediária",
    body: "A Orbien é a plataforma de gestão, não o banco. Não há taxa sobre as doações — você fica com tudo.",
  },
] as const;

export function PixFlow() {
  return (
    <section className="py-20 md:py-24">
      <div className="mx-auto max-w-[1180px] px-6">
        <div className="grid grid-cols-1 gap-12 items-start md:grid-cols-[1fr_1fr] md:gap-16">
          {/* Left: text */}
          <Reveal>
            <SectionLabel className="mb-[18px]">Como o PIX funciona</SectionLabel>
            <h2
              className="font-medium tracking-[-0.025em] mb-5"
              style={{ fontSize: "clamp(28px, 3.8vw, 40px)", lineHeight: 1.1, color: "var(--ink)" }}
            >
              O dinheiro vai direto pra sua iglesia.
            </h2>
            <p className="text-[16px] font-light leading-relaxed mb-8 max-w-[460px]" style={{ color: "var(--stone)" }}>
              A maior preocupação de quem não tem CNPJ é com o dinheiro das doações. A resposta é simples: a Orbien não toca nele.
            </p>

            <div className="flex flex-col gap-5">
              {GUARANTEES.map(({ title, body }) => (
                <div key={title} className="flex gap-3.5">
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: "var(--teal-dim)", color: "#00B8A2" }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                  <div>
                    <p className="text-[14.5px] font-medium mb-0.5" style={{ color: "var(--ink)" }}>{title}</p>
                    <p className="text-[13.5px] font-light leading-relaxed" style={{ color: "var(--stone)" }}>{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

          {/* Right: diagram */}
          <Reveal>
            <FlowDiagram />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
