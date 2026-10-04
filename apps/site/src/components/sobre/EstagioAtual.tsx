import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";

const MARCOS = [
  { status: "done",    label: "Fundação e arquitetura do produto"        },
  { status: "done",    label: "Design system Precision Modern finalizado" },
  { status: "done",    label: "Módulos de membros e finanças em piloto"   },
  { status: "active",  label: "Validação com igrejas-piloto em andamento" },
  { status: "active",  label: "Pequenos grupos e conteúdos em revisão"    },
  { status: "pending", label: "Lista de espera aberta — leva de lançamento" },
  { status: "pending", label: "Lançamento público — previsão 2026"         },
] as const;

const dotStyle: Record<typeof MARCOS[number]["status"], { bg: string; shadow: string; label: string }> = {
  done:    { bg: "var(--color-teal)", shadow: "color-mix(in srgb, var(--color-teal) 20%, transparent)",    label: "Concluído"  },
  active:  { bg: "var(--color-amber)", shadow: "color-mix(in srgb, var(--color-amber) 20%, transparent)",    label: "Em andamento" },
  pending: { bg: "var(--border-strong)", shadow: "transparent", label: "Próximo"  },
};

export function EstagioAtual() {
  return (
    <section className="relative overflow-hidden py-20 md:py-24" style={{ background: "var(--color-navy)" }}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 80% 20%, color-mix(in srgb, var(--color-teal) 15%, transparent), transparent 50%), radial-gradient(circle at 5% 85%, color-mix(in srgb, var(--ink) 4%, transparent), transparent 50%)",
        }}
      />

      <div className="relative mx-auto max-w-[1180px] px-6">
        <Reveal>
          <div className="grid grid-cols-1 gap-12 items-start md:grid-cols-[1.1fr_1fr] md:gap-16">

            {/* Left */}
            <div>
              <SectionLabel
                className="mb-5"
                color="color-mix(in srgb, var(--ink) 60%, transparent)"
                lineColor="color-mix(in srgb, var(--ink) 30%, transparent)"
              >
                Estágio atual
              </SectionLabel>

              <h2
                className="font-semibold text-white tracking-[-0.025em] mb-5"
                style={{ fontSize: "clamp(28px, 3.8vw, 42px)", lineHeight: 1.08 }}
              >
                Estamos em fase piloto — e somos transparentes sobre isso.
              </h2>

              <p
                className="text-[16px] font-light leading-[1.65] mb-8 max-w-[460px]"
                style={{ color: "color-mix(in srgb, var(--ink) 72%, transparent)" }}
              >
                O Orbien não está em venda aberta. Estamos validando com igrejas parceiras em Passo Fundo, RS — construindo de verdade com quem vai usar, não apenas para quem vai comprar.
              </p>

              <blockquote
                className="border-l-2 pl-5 mb-8"
                style={{ borderColor: "color-mix(in srgb, var(--color-teal) 60%, transparent)" }}
              >
                <p className="text-[15px] font-light italic leading-[1.6]" style={{ color: "color-mix(in srgb, var(--ink) 82%, transparent)" }}>
                  &quot;Cada feature é validada com um pastor antes de ir pra produção. Quem usa decide o que fica.&quot;
                </p>
              </blockquote>

              <div className="flex gap-3 flex-wrap">
                {/* TODO: connect to real waitlist action */}
                <a
                  href="#waitlist"
                  className="inline-flex h-11 items-center gap-2 cta-primary px-5 text-[14px]"
                >
                  Entrar na lista de espera
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                  </svg>
                </a>
                <a
                  href="https://wa.me/5554999529683"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center gap-2 cta-secondary px-5 text-[14px]"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </svg>
                  Falar no WhatsApp
                </a>
              </div>
            </div>

            {/* Right — roadmap card */}
            <div
              className="rounded-[14px] p-7"
              style={{
                background: "color-mix(in srgb, var(--ink) 6%, transparent)",
                border: "1px solid color-mix(in srgb, var(--ink) 10%, transparent)",
                backdropFilter: "blur(20px)",
              }}
            >
              <p
                className="text-sm font-medium mb-6"
                style={{ color: "color-mix(in srgb, var(--ink) 45%, transparent)" }}
              >
                Linha do tempo
              </p>

              <div className="flex flex-col gap-4">
                {MARCOS.map(({ status, label }) => {
                  const { bg, shadow } = dotStyle[status];
                  return (
                    <div key={label} className="flex items-start gap-3.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-[5px]"
                        style={{ background: bg, boxShadow: `0 0 0 3px ${shadow}` }}
                      />
                      <span
                        className="text-[14px] font-light leading-snug"
                        style={{
                          color: status === "pending"
                            ? "color-mix(in srgb, var(--ink) 38%, transparent)"
                            : status === "active"
                            ? "color-mix(in srgb, var(--ink) 90%, transparent)"
                            : "color-mix(in srgb, var(--ink) 65%, transparent)",
                        }}
                      >
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Pilot partner */}
              <div
                className="mt-7 pt-6 border-t"
                style={{ borderColor: "color-mix(in srgb, var(--ink) 10%, transparent)" }}
              >
                <p className="text-xs font-medium mb-3" style={{ color: "color-mix(in srgb, var(--ink) 38%, transparent)" }}>
                  Igreja-piloto
                </p>
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0"
                    style={{ background: "color-mix(in srgb, var(--ink) 10%, transparent)" }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="color-mix(in srgb, var(--ink) 70%, transparent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[14px] font-medium text-white">Doca Church</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "color-mix(in srgb, var(--ink) 45%, transparent)" }}>
                      Passo Fundo · RS · desde 2025
                    </p>
                  </div>
                </div>
                <p
                  className="mt-3 text-[13px] font-light leading-relaxed"
                  style={{ color: "color-mix(in srgb, var(--ink) 55%, transparent)" }}
                >
                  Validação ativa dos módulos de membros, financeiro e pequenos grupos com a equipe da Doca Church.
                </p>
              </div>
            </div>

          </div>
        </Reveal>
      </div>
    </section>
  );
}
