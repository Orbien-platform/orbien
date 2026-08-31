import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";

const CENARIOS = [
  {
    num: "01",
    title: "PIX por chave manual",
    availability: "Starter e Premium",
    availabilityBg: "var(--teal-dim)",
    availabilityColor: "#00B8A2",
    fee: "Sem taxa",
    feeBg: "var(--teal-dim)",
    feeColor: "#00B8A2",
    body: "Você configura CPF, telefone ou e-mail como chave. O membro paga pelo app de qualquer banco. O recibo sai automático — a Orbien não toca no dinheiro.",
    steps: [
      "Membro abre o app e toca em Fazer doação",
      "Confirma o valor e paga pelo banco de costume",
      "PIX cai na chave da igreja · recibo gerado",
    ],
    highlight: false,
  },
  {
    num: "02",
    title: "PIX dinâmico",
    availability: "Somente Premium",
    availabilityBg: "var(--navy-dim)",
    availabilityColor: "var(--navy-accent)",
    fee: "≈ 2% por transação",
    feeBg: "var(--subtle)",
    feeColor: "var(--stone)",
    body: "QR code único por doação, gerado automaticamente. A Asaas processa, confirma e repassa para a conta da igreja em D+1. Ideal para eventos e campanhas.",
    steps: [
      "App gera QR code único para a doação",
      "Asaas confirma o pagamento",
      "Repasse para a conta da igreja em D+1",
    ],
    highlight: true,
  },
  {
    num: "03",
    title: "Dízimo recorrente",
    availability: "Somente Premium",
    availabilityBg: "var(--navy-dim)",
    availabilityColor: "var(--navy-accent)",
    fee: "Sem taxa adicional",
    feeBg: "var(--teal-dim)",
    feeColor: "#00B8A2",
    body: "O membro configura o valor e o dia do débito uma única vez. O sistema debita automaticamente todo mês via PIX — sem lembretes, sem esquecimentos.",
    steps: [
      "Membro define valor e dia de vencimento",
      "PIX recorrente debitado todo mês automaticamente",
      "Extrato e histórico disponíveis no app",
    ],
    highlight: false,
  },
] as const;

export function PixCenarios() {
  return (
    <section className="py-20 md:py-24" style={{ background: "var(--subtle)" }}>
      <div className="mx-auto max-w-[1180px] px-6">
        <Reveal className="mb-14">
          <SectionLabel className="mb-[18px]">Cenários de doação</SectionLabel>
          <h2
            className="font-medium tracking-[-0.025em] mb-3.5"
            style={{ fontSize: "clamp(30px, 4.2vw, 44px)", lineHeight: 1.1, color: "var(--ink)" }}
          >
            Três formas de receber via PIX.
          </h2>
          <p className="text-[17px] font-light leading-relaxed max-w-[560px]" style={{ color: "var(--stone)" }}>
            Do PIX simples sem taxa até o dízimo automático mensal — escolha o que serve para a realidade da sua igreja.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {CENARIOS.map(({ num, title, availability, availabilityBg, availabilityColor, fee, feeBg, feeColor, body, steps, highlight }) => (
            <Reveal key={num}>
              <div
                className="rounded-card border-2 p-7 h-full flex flex-col gap-5"
                style={{
                  background: "var(--surface)",
                  borderColor: highlight ? "var(--navy-accent)" : "var(--border)",
                  boxShadow: highlight ? "var(--shadow-md)" : undefined,
                }}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <span className="font-mono text-[11px] font-medium tracking-[.1em]" style={{ color: "var(--navy-accent)" }}>
                    {num}
                  </span>
                  <span
                    className="font-mono text-[10px] px-2.5 py-1 rounded-pill"
                    style={{ background: availabilityBg, color: availabilityColor }}
                  >
                    {availability}
                  </span>
                </div>

                <div>
                  <h3 className="text-[18px] font-semibold tracking-[-0.02em] mb-2.5" style={{ color: "var(--ink)" }}>
                    {title}
                  </h3>
                  <p className="text-[14px] font-light leading-relaxed" style={{ color: "var(--stone)" }}>
                    {body}
                  </p>
                </div>

                {/* Steps */}
                <div className="flex flex-col gap-2">
                  {steps.map((step, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <span
                        className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 font-mono text-[8px] font-medium mt-px"
                        style={{ background: "var(--navy-tint)", color: "var(--navy-accent)" }}
                      >
                        {i + 1}
                      </span>
                      <span className="text-[12.5px] font-light leading-snug" style={{ color: "var(--stone)" }}>
                        {step}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Fee badge */}
                <div className="mt-auto pt-4 border-t flex items-center gap-2" style={{ borderColor: "var(--border)" }}>
                  <span className="font-mono text-[10px] uppercase tracking-[.06em]" style={{ color: "var(--muted)" }}>
                    Taxa:
                  </span>
                  <span
                    className="font-mono text-[10px] font-medium px-2 py-0.5 rounded-pill"
                    style={{ background: feeBg, color: feeColor }}
                  >
                    {fee}
                  </span>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <div
            className="mt-5 flex items-start gap-3 rounded-[10px] px-5 py-4 text-[13.5px] leading-[1.55]"
            style={{ background: "var(--sand)", color: "var(--stone)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-px" style={{ color: "var(--navy-accent)" }}>
              <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
            </svg>
            Os cenários 2 e 3 usam a{" "}
            <strong className="font-medium" style={{ color: "var(--ink)" }}>Asaas</strong>{" "}
            como intermediária financeira e exigem conta bancária da igreja. A taxa de ≈ 2% é cobrada pela Asaas (≈ 1%) + Orbien (1% de orquestração). O cenário 1 não tem intermediária — nenhum centavo passa pela Orbien.
          </div>
        </Reveal>
      </div>
    </section>
  );
}
