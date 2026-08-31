import { SectionLabel } from "@/components/ui/SectionLabel";

export function SobreHero() {
  return (
    <section className="pt-20 pb-16 md:pt-28 md:pb-20">
      <div className="mx-auto max-w-[1180px] px-6">
        <div className="max-w-[820px]">
          <SectionLabel className="mb-7">Sobre a Orbien</SectionLabel>

          <h1
            className="font-light tracking-[-0.035em] mb-7"
            style={{ fontSize: "clamp(44px, 7vw, 80px)", lineHeight: 1.02, color: "var(--ink)" }}
          >
            Gestão que serve.{" "}
            <strong className="font-semibold" style={{ color: "var(--navy-accent)" }}>
              Igreja que cresce.
            </strong>
          </h1>

          <p
            className="font-light leading-[1.65] mb-10 max-w-[640px]"
            style={{ fontSize: "clamp(17px, 1.8vw, 20px)", color: "var(--stone)" }}
          >
            Igrejas de pequeno e médio porte no Brasil merecem uma plataforma moderna, acessível e bonita — sem burocracia de CNPJ, sem interface datada, sem preço de sistema enterprise. O Orbien existe para isso.
          </p>

          {/* Meta line */}
          <div
            className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11.5px] tracking-[.08em] pt-8 border-t"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
          >
            {[
              "Church Platform Ltda",
              "Passo Fundo · RS",
              "Em desenvolvimento ativo",
              "Fase piloto · 2026",
            ].map((item, i) => (
              <span key={item} className="flex items-center gap-3">
                {i > 0 && <span className="hidden sm:inline" style={{ color: "var(--border-strong)" }}>·</span>}
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
