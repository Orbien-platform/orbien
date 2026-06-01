export function PrecosHero() {
  return (
    <section className="pt-20 pb-16 md:pt-24 md:pb-16">
      <div className="mx-auto max-w-[1180px] px-6">
        <p
          className="inline-flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[.14em] mb-[22px]"
          style={{ color: "var(--navy-accent)" }}
        >
          <span className="w-6 h-px" style={{ background: "var(--navy-accent)" }} />
          Planos e preços
        </p>
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
