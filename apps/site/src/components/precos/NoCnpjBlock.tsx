import Link from "next/link";
import { SectionLabel } from "@/components/ui/SectionLabel";

const STATS = [
  "PIX cai direto na chave da igreja",
  "Orbien não toca no dinheiro",
  "Migração pro Premium em 15 min",
];

export function NoCnpjBlock() {
  return (
    <section
      className="relative overflow-hidden py-[72px]"
      style={{ background: "var(--color-navy)", color: "var(--ink)" }}
    >
      {/* Gradient overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 90% 10%, color-mix(in srgb, var(--color-teal) 18%, transparent), transparent 55%), radial-gradient(circle at 5% 95%, color-mix(in srgb, var(--ink) 5%, transparent), transparent 50%)",
        }}
      />

      <div className="relative mx-auto max-w-[1180px] px-6">
        <div
          className="grid grid-cols-1 gap-8 items-center md:gap-14"
          style={{ gridTemplateColumns: "1.3fr 1fr" } as React.CSSProperties}
        >
          {/* Left */}
          <div>
            <SectionLabel className="mb-[18px]" color="color-mix(in srgb, var(--ink) 70%, transparent)" lineColor="color-mix(in srgb, var(--ink) 40%, transparent)">
              Antes da formalização
            </SectionLabel>
            <h2
              className="font-semibold text-white mb-4 tracking-[-0.025em]"
              style={{ fontSize: "clamp(28px, 3.6vw, 38px)", lineHeight: 1.1 }}
            >
              Sua igreja ainda não tem CNPJ?
            </h2>
            <p
              className="text-[17px] font-light leading-relaxed mb-6 max-w-[480px]"
              style={{ color: "color-mix(in srgb, var(--ink) 78%, transparent)" }}
            >
              O Starter foi feito pra você. Comece hoje, formalize depois — a gente faz a transição sem complicação.
            </p>
            <Link
              href="/sem-cnpj"
              className="inline-flex h-12 items-center gap-2 cta-primary px-6 text-[15px]"
            >
              Veja como funciona
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </div>

          {/* Right: stats card */}
          <div
            className="rounded-[12px] p-7"
            style={{
              background: "color-mix(in srgb, var(--ink) 6%, transparent)",
              border: "1px solid color-mix(in srgb, var(--ink) 12%, transparent)",
              backdropFilter: "blur(20px)",
            }}
          >
            {STATS.map((stat, i) => (
              <div
                key={stat}
                className={`flex items-center gap-3 py-2.5 ${i > 0 ? "border-t" : ""}`}
                style={{ borderColor: "color-mix(in srgb, var(--ink) 8%, transparent)" }}
              >
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "color-mix(in srgb, var(--color-teal) 20%, transparent)", color: "var(--color-teal-dark)" }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <span className="text-[14.5px]" style={{ color: "color-mix(in srgb, var(--ink) 90%, transparent)" }}>
                  {stat}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
