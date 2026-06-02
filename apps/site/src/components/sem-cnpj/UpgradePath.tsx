import Link from "next/link";
import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";

const STEPS = [
  "CNPJ registrado no cadastro da iglesia",
  "Chave PIX migrada para o CNPJ",
  "Acesso ao plano Premium desbloqueado",
  "App nas lojas com a marca da sua iglesia",
] as const;

const PREMIUM_EXTRAS = [
  "App publicado nas lojas com nome e logo da iglesia",
  "Dízimo recorrente automático via PIX",
  "Contratos e gestão patrimonial",
  "Multiusuário com permissões por cargo",
] as const;

export function UpgradePath() {
  return (
    <section className="relative overflow-hidden py-20 md:py-24" style={{ background: "#1E3A7B" }}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 85% 15%, rgba(0,184,162,.18), transparent 50%), radial-gradient(circle at 10% 90%, rgba(255,255,255,.04), transparent 50%)",
        }}
      />

      <div className="relative mx-auto max-w-[1180px] px-6">
        <Reveal>
          <div className="grid grid-cols-1 gap-10 items-start md:grid-cols-[1.1fr_1fr] md:gap-16">
            {/* Left */}
            <div>
              <SectionLabel className="mb-5" color="rgba(255,255,255,.6)" lineColor="rgba(255,255,255,.35)">
                Quando chegar o CNPJ
              </SectionLabel>
              <h2
                className="font-semibold text-white tracking-[-0.025em] mb-4"
                style={{ fontSize: "clamp(28px, 3.6vw, 40px)", lineHeight: 1.1 }}
              >
                A formalização chegou? A migração leva 15 minutos.
              </h2>
              <p
                className="text-[16px] font-light leading-relaxed mb-8 max-w-[460px]"
                style={{ color: "rgba(255,255,255,.72)" }}
              >
                Você não recomeça do zero. Todos os membros, histórico financeiro e configurações migram automaticamente pro plano Premium.
              </p>

              <div className="flex flex-col gap-2.5 mb-8">
                {STEPS.map((step, i) => (
                  <div
                    key={step}
                    className="flex items-center gap-3"
                    style={{ color: "rgba(255,255,255,.88)" }}
                  >
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 font-mono text-[10px] font-medium"
                      style={{ background: "rgba(255,255,255,.12)", color: "rgba(255,255,255,.7)" }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-[14px] font-light">{step}</span>
                  </div>
                ))}
              </div>

              <Link
                href="/precos"
                className="inline-flex h-11 items-center gap-2 rounded-btn bg-white px-5 text-[14px] font-medium transition-all hover:-translate-y-px"
                style={{ color: "#1E3A7B" }}
              >
                Ver plano Premium
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
            </div>

            {/* Right: Premium extras card */}
            <div
              className="rounded-[14px] p-7"
              style={{
                background: "rgba(255,255,255,.06)",
                border: "1px solid rgba(255,255,255,.11)",
                backdropFilter: "blur(20px)",
              }}
            >
              <p
                className="font-mono text-[10px] uppercase tracking-[.12em] mb-5"
                style={{ color: "rgba(255,255,255,.5)" }}
              >
                O que desbloqueia no Premium
              </p>
              <div className="flex flex-col gap-3">
                {PREMIUM_EXTRAS.map((extra) => (
                  <div
                    key={extra}
                    className="flex items-start gap-3"
                  >
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: "rgba(0,205,181,.18)", color: "#00CDB5" }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                    <span className="text-[14px] font-light leading-snug" style={{ color: "rgba(255,255,255,.82)" }}>
                      {extra}
                    </span>
                  </div>
                ))}
              </div>

              <div
                className="mt-6 pt-5 border-t"
                style={{ borderColor: "rgba(255,255,255,.1)" }}
              >
                <p className="font-mono text-[10px] uppercase tracking-[.1em] mb-1" style={{ color: "rgba(255,255,255,.4)" }}>
                  Tempo de migração
                </p>
                <p className="text-white font-semibold text-lg tracking-[-0.02em]">15 minutos</p>
                <p className="text-[12px] font-light mt-0.5" style={{ color: "rgba(255,255,255,.5)" }}>
                  Feito pelo painel — sem suporte necessário
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
