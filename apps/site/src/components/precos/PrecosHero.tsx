import { SectionLabel } from "@/components/ui/SectionLabel";

export function PrecosHero() {
  return (
    <section className="pt-20 pb-16 md:pt-24 md:pb-16">
      <div className="mx-auto max-w-[1180px] px-6">
        <SectionLabel className="mb-[22px]">Planos e preços</SectionLabel>
        <h1
          className="font-semibold leading-[1.04] tracking-[-0.035em] mb-[22px] max-w-[800px]"
          style={{ fontSize: "clamp(36px, 5.4vw, 60px)", color: "var(--ink)" }}
        >
          Dois planos. O preço cresce com a sua igreja.
        </h1>
        <p
          className="font-light leading-[1.55] max-w-[640px]"
          style={{ fontSize: "clamp(17px, 1.6vw, 19px)", color: "var(--stone)" }}
        >
          Sem pegadinha por funcionalidade escondida. Você paga pelo plano e pela faixa de membros que sua igreja tem hoje. Quando crescer, o sistema avisa — e você tem 30 dias pra ajustar.
        </p>
      </div>
    </section>
  );
}
