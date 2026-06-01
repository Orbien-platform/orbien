import { Reveal } from "@/components/ui/Reveal";

const CARDS = [
  {
    label: "Plano Starter",
    name: "Starter",
    price: "299,00",
    priceNote: "único",
    desc: "Setup completo do ambiente, importação dos primeiros dados e treinamento da equipe. Sem publicação nas lojas.",
  },
  {
    label: "Plano Premium",
    name: "Premium",
    price: "499,00",
    priceNote: "único",
    desc: "Tudo do Starter + publicação do app próprio nas lojas (App Store e Google Play) via EAS Build.",
  },
  {
    label: "Vindo de outro sistema",
    name: "Migração assistida",
    price: "499",
    priceNote: "a R$ 999",
    desc: "Pra igrejas vindas de Eklesia, InPeace ou planilha. A gente faz a importação e validação dos dados junto com você.",
  },
] as const;

export function Implementation() {
  return (
    <section className="pb-20 md:pb-24" id="implantacao">
      <div className="mx-auto max-w-[1180px] px-6">
        <Reveal className="mb-12">
          <p
            className="inline-flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[.14em] mb-[18px]"
            style={{ color: "var(--navy-accent)" }}
          >
            <span className="w-6 h-px" style={{ background: "var(--navy-accent)" }} />
            Setup inicial
          </p>
          <h2
            className="font-medium tracking-[-0.025em] mb-3.5"
            style={{ fontSize: "clamp(28px, 3.6vw, 40px)", lineHeight: 1.1, color: "var(--ink)" }}
          >
            Implantação — pagamento único na contratação
          </h2>
          <p className="text-base font-light leading-relaxed max-w-[620px]" style={{ color: "var(--stone)" }}>
            Cobrado uma vez, no início. Depois é só a mensalidade da tabela acima.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {CARDS.map(({ label, name, price, priceNote, desc }) => (
            <Reveal key={name}>
              <div
                className="card-hover-border rounded-[14px] border p-7 flex flex-col gap-3.5 h-full"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                <div
                  className="font-mono text-[11px] uppercase tracking-[.14em]"
                  style={{ color: "var(--stone)" }}
                >
                  {label}
                </div>
                <div
                  className="text-[22px] font-semibold tracking-[-0.02em]"
                  style={{ color: "var(--ink)" }}
                >
                  {name}
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[15px] font-normal" style={{ color: "var(--stone)" }}>R$</span>
                  <span
                    className="font-mono font-medium text-[28px] tracking-[-0.02em]"
                    style={{ color: "var(--ink)" }}
                  >
                    {price}
                  </span>
                  <span className="ml-1 text-[13px] font-normal" style={{ color: "var(--muted)" }}>
                    {priceNote}
                  </span>
                </div>
                <p className="flex-1 text-[14.5px] font-light leading-relaxed" style={{ color: "var(--stone)" }}>
                  {desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <div
            className="mt-6 flex items-start gap-3 rounded-[10px] px-5 py-4 text-[13.5px] leading-[1.55]"
            style={{ background: "var(--sand)", color: "var(--stone)" }}
          >
            <svg
              width="18" height="18"
              viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round"
              className="flex-shrink-0 mt-px"
              style={{ color: "var(--navy-accent)" }}
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" /><path d="M12 8h.01" />
            </svg>
            <div>
              Publicação nas lojas exige conta própria da igreja na{" "}
              <strong className="font-medium" style={{ color: "var(--ink)" }}>Apple Developer</strong>{" "}
              (US$ 99/ano) e{" "}
              <strong className="font-medium" style={{ color: "var(--ink)" }}>Google Play Console</strong>{" "}
              (US$ 25, pagamento único).
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
