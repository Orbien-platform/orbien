import { Reveal } from "@/components/ui/Reveal";

const FAQS = [
  {
    q: "Posso começar no Starter e migrar pro Premium depois?",
    a: (
      <>Sim. Todos os dados migram automaticamente, sem retrabalho. O ajuste de cobrança é <strong className="font-medium" style={{ color: "var(--ink)" }}>pro rata</strong> no mês da mudança.</>
    ),
  },
  {
    q: "Tem fidelidade?",
    a: (
      <>O contrato tem prazo mínimo de <strong className="font-medium" style={{ color: "var(--ink)" }}>12 meses</strong>. A multa por cancelamento antecipado é de <strong className="font-medium" style={{ color: "var(--ink)" }}>35% do que sobrar</strong>. O trial de 14 dias não conta — você só assume o contrato quando decide ficar.</>
    ),
  },
  {
    q: "Quem cobra do membro quando ele doa?",
    a: (
      <>No <strong className="font-medium" style={{ color: "var(--ink)" }}>Starter</strong>, a doação cai direto na chave PIX da igreja — a Orbien não toca no dinheiro. No <strong className="font-medium" style={{ color: "var(--ink)" }}>Premium</strong>, a Asaas processa e repassa em D+1.</>
    ),
  },
  {
    q: "Quanto custa a taxa de PIX?",
    a: (
      <><strong className="font-medium" style={{ color: "var(--ink)" }}>Cenário 1 (PIX manual, Starter e Premium):</strong> sem taxa — o dinheiro cai direto na chave da igreja, a Orbien não toca. <strong className="font-medium" style={{ color: "var(--ink)" }}>Cenário 2 (PIX dinâmico, Premium):</strong> a Asaas cobra cerca de 1% e a Orbien retém 1% pelo serviço de orquestração — total aproximado de <strong className="font-medium" style={{ color: "var(--ink)" }}>2% por transação</strong>.</>
    ),
  },
  {
    q: "E se a igreja crescer e passar de 300 membros?",
    a: (
      <>Sem problema. Não há limite duro no Premium. Conversamos sobre plano sob medida a partir de <strong className="font-medium" style={{ color: "var(--ink)" }}>500 membros</strong>.</>
    ),
  },
  {
    q: "Posso pagar anualmente com desconto?",
    a: (
      <>Sim, <strong className="font-medium" style={{ color: "var(--ink)" }}>dois meses grátis</strong> no pagamento anual de qualquer plano.</>
    ),
  },
  {
    q: "Cobra por membro cadastrado?",
    a: (
      <>Não. Os planos têm cadastro ilimitado de membros e visitantes. O preço varia pela <strong className="font-medium" style={{ color: "var(--ink)" }}>faixa de membros ativos</strong> da igreja, não pelo total cadastrado.</>
    ),
  },
  {
    q: "Tem limite de espaço pra fotos e arquivos?",
    a: (
      <><strong className="font-medium" style={{ color: "var(--ink)" }}>Starter:</strong> 5 GB. <strong className="font-medium" style={{ color: "var(--ink)" }}>Premium:</strong> 50 GB. Aumenta sob demanda.</>
    ),
  },
  {
    q: "Como funciona o reajuste anual?",
    a: (
      <><strong className="font-medium" style={{ color: "var(--ink)" }}>IGPM/IPCA</strong> (o maior dos dois), aplicado na renovação anual, com aviso de 30 dias.</>
    ),
  },
] as const;

export function PrecosFaq() {
  return (
    <section className="py-20 md:py-24" id="faq">
      <div className="mx-auto max-w-[1180px] px-6">
        <Reveal className="mb-12">
          <p
            className="inline-flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[.14em] mb-[18px]"
            style={{ color: "var(--navy-accent)" }}
          >
            <span className="w-6 h-px" style={{ background: "var(--navy-accent)" }} />
            FAQ
          </p>
          <h2
            className="font-medium tracking-[-0.025em] mb-3.5"
            style={{ fontSize: "clamp(28px, 3.6vw, 40px)", lineHeight: 1.1, color: "var(--ink)" }}
          >
            Perguntas sobre preço e contrato
          </h2>
          <p className="text-base font-light leading-relaxed max-w-[620px]" style={{ color: "var(--stone)" }}>
            As coisas que aparecem antes de assinar — e que a gente prefere responder agora.
          </p>
        </Reveal>

        <div className="flex flex-col gap-2 max-w-[880px]">
          {FAQS.map(({ q, a }) => (
            <Reveal key={q}>
              <details
                className="faq-details rounded-modal border overflow-hidden transition-colors"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                <summary
                  className="flex items-center justify-between gap-4 px-6 py-5 cursor-pointer text-base font-medium tracking-[-0.01em] list-none hover:bg-[var(--bg)] transition-colors"
                  style={{ color: "var(--ink)" }}
                >
                  {q}
                  <span
                    className="faq-icon w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200"
                    style={{ background: "var(--navy-tint)", color: "var(--navy-accent)" }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </span>
                </summary>
                <div
                  className="px-6 pb-[22px] text-[14.5px] font-light leading-[1.65] max-w-[720px]"
                  style={{ color: "var(--stone)" }}
                >
                  {a}
                </div>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
