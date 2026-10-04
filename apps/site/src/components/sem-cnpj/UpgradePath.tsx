import Link from "next/link";
import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";

const STEPS = [
  "CNPJ registrado no cadastro da igreja",
  "Chave PIX migrada para o CNPJ",
  "Acesso ao plano Premium desbloqueado",
  "App nas lojas com a marca da sua igreja",
] as const;

const PREMIUM_EXTRAS = [
  "App publicado nas lojas com nome e logo da igreja",
  "Dízimo recorrente automático via PIX",
  "Contratos e gestão patrimonial",
  "Multiusuário com permissões por cargo",
] as const;

export function UpgradePath() {
  return (
    <section className="relative overflow-hidden py-20 md:py-24" style={{ background: "var(--color-navy)" }}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 85% 15%, color-mix(in srgb, var(--color-teal) 18%, transparent), transparent 50%), radial-gradient(circle at 10% 90%, color-mix(in srgb, var(--ink) 4%, transparent), transparent 50%)",
        }}
      />

      <div className="relative mx-auto max-w-[1180px] px-6">
        <Reveal>
          <div className="grid grid-cols-1 gap-10 items-start md:grid-cols-[1.1fr_1fr] md:gap-16">
            {/* Left */}
            <div>
              <SectionLabel className="mb-5" color="color-mix(in srgb, var(--ink) 60%, transparent)" lineColor="color-mix(in srgb, var(--ink) 35%, transparent)">
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
                style={{ color: "color-mix(in srgb, var(--ink) 72%, transparent)" }}
              >
                Você não recomeça do zero. Todos os membros, histórico financeiro e configurações migram automaticamente pro plano Premium.
              </p>

              <div className="flex flex-col gap-2.5 mb-8">
                {STEPS.map((step, i) => (
                  <div
                    key={step}
                    className="flex items-center gap-3"
                    style={{ color: "color-mix(in srgb, var(--ink) 88%, transparent)" }}
                  >
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 font-mono text-[11px] font-medium"
                      style={{ background: "color-mix(in srgb, var(--ink) 12%, transparent)", color: "color-mix(in srgb, var(--ink) 70%, transparent)" }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-[14px] font-light">{step}</span>
                  </div>
                ))}
              </div>

              <Link
                href="/precos"
                className="inline-flex h-11 items-center gap-2 cta-primary px-5 text-[14px]"
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
                background: "color-mix(in srgb, var(--ink) 6%, transparent)",
                border: "1px solid color-mix(in srgb, var(--ink) 11%, transparent)",
                backdropFilter: "blur(20px)",
              }}
            >
              <p
                className="text-sm font-medium mb-5"
                style={{ color: "color-mix(in srgb, var(--ink) 50%, transparent)" }}
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
                      style={{ background: "color-mix(in srgb, var(--color-teal) 18%, transparent)", color: "var(--color-teal-dark)" }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                    <span className="text-[14px] font-light leading-snug" style={{ color: "color-mix(in srgb, var(--ink) 82%, transparent)" }}>
                      {extra}
                    </span>
                  </div>
                ))}
              </div>

              <div
                className="mt-6 pt-5 border-t"
                style={{ borderColor: "color-mix(in srgb, var(--ink) 10%, transparent)" }}
              >
                <p className="text-xs mb-1" style={{ color: "color-mix(in srgb, var(--ink) 40%, transparent)" }}>
                  Tempo de migração
                </p>
                <p className="text-white font-semibold text-lg tracking-[-0.02em]">15 minutos</p>
                <p className="text-[12px] font-light mt-0.5" style={{ color: "color-mix(in srgb, var(--ink) 50%, transparent)" }}>
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
