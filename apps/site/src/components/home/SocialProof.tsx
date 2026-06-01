import { Reveal } from "@/components/ui/Reveal";

export function SocialProof() {
  return (
    <section style={{ background: "var(--sand)" }}>
      <div className="mx-auto max-w-[1180px] px-6">
        <Reveal>
          <div className="text-center py-14 px-8 max-w-[720px] mx-auto">
            <p
              className="inline-flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[.14em] mb-[18px]"
              style={{ color: "var(--stone)" }}
            >
              <span className="w-6 h-px" style={{ background: "var(--stone)" }} />
              Igrejas-piloto
            </p>
            <p
              className="font-light leading-[1.4] tracking-[-0.015em]"
              style={{
                fontSize: "clamp(20px, 2.4vw, 26px)",
                color: "var(--ink)",
              }}
            >
              Em desenvolvimento ativo com a{" "}
              <strong className="font-semibold" style={{ color: "var(--navy-accent)" }}>
                Doca Church
              </strong>{" "}
              (Passo Fundo, RS) e mais igrejas em fase de validação.
            </p>
            <p
              className="mt-5 font-mono text-[11px] uppercase tracking-[.08em]"
              style={{ color: "var(--muted)" }}
            >
              Cada feature é validada com um pastor antes de ir pra produção.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
