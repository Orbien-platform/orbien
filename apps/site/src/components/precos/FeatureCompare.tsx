import { Reveal } from "@/components/ui/Reveal";
import { CheckIcon } from "@/components/ui/CheckIcon";
import { SectionLabel } from "@/components/ui/SectionLabel";

type CellValue =
  | { type: "check" }
  | { type: "dash" }
  | { type: "qual"; text: string };

type CompareRow = { feature: string; starter: CellValue; premium: CellValue };
type CompareGroup = { heading: string; rows: CompareRow[] };

const C = {
  check: { type: "check" as const },
  dash: { type: "dash" as const },
  q: (text: string): CellValue => ({ type: "qual", text }),
};

const GROUPS: CompareGroup[] = [
  {
    heading: "Acesso e identidade",
    rows: [
      { feature: "Igreja sem CNPJ",              starter: C.check,              premium: C.check },
      { feature: "Cadastro ilimitado de membros", starter: C.check,              premium: C.check },
      { feature: "App nas lojas",                 starter: C.q("skin da igreja"), premium: C.q("app próprio") },
      { feature: "Domínio próprio (web)",          starter: C.dash,               premium: C.check },
    ],
  },
  {
    heading: "Doações e PIX",
    rows: [
      { feature: "PIX por chave manual",           starter: C.check,              premium: C.check },
      { feature: "Página pública de doação",       starter: C.q("chave PIX"),     premium: C.q("QR dinâmico") },
      { feature: "PIX com QR dinâmico",            starter: C.dash,               premium: C.check },
      { feature: "PIX recorrente (dízimo automático)", starter: C.dash,           premium: C.check },
      { feature: "Recibo automático por email",    starter: C.dash,               premium: C.check },
    ],
  },
  {
    heading: "Financeiro e contabilidade",
    rows: [
      { feature: "Dashboard de entradas semanais", starter: C.check,              premium: C.check },
      { feature: "DRE, fluxo de caixa, forecast",  starter: C.dash,               premium: C.check },
      { feature: "Exportação contábil (OFX, SPED)", starter: C.dash,              premium: C.check },
      { feature: "Carnê do dizimista (IR)",         starter: C.dash,               premium: C.check },
    ],
  },
  {
    heading: "Pequenos grupos",
    rows: [
      { feature: "Cadastro e materiais",            starter: C.check,              premium: C.check },
      { feature: "Semáforo de saúde da célula",     starter: C.dash,               premium: C.check },
    ],
  },
  {
    heading: "Suporte",
    rows: [
      { feature: "Suporte por email",               starter: C.check,              premium: C.check },
      { feature: "Suporte por WhatsApp",            starter: C.dash,               premium: C.check },
      { feature: "Treinamento da equipe",           starter: C.dash,               premium: C.q("1 sessão inclusa") },
    ],
  },
];


function Cell({ value, variant, mobileLabel }: { value: CellValue; variant: "starter" | "premium"; mobileLabel: string }) {
  const isPremium = variant === "premium";
  return (
    <div
      className={[
        "px-5 md:px-7 py-3 md:py-4 flex items-center gap-2 text-sm",
        isPremium
          ? "md:[border-left:2px_solid_#00B8A2] md:bg-[var(--navy-soft)]"
          : "md:border-l",
      ].join(" ")}
      style={{
        borderColor: "var(--border)",
        color: value.type === "qual" || (value.type === "check" && isPremium) ? "var(--ink)" : "var(--stone)",
        fontWeight: value.type === "qual" || (value.type === "check" && isPremium) ? "400" : "300",
      }}
    >
      {/* Mobile prefix */}
      <span
        className="md:hidden font-mono text-[10px] uppercase tracking-[.1em] mr-1 shrink-0"
        style={{ color: isPremium ? "var(--navy-accent)" : "var(--muted)" }}
      >
        {mobileLabel} ·{" "}
      </span>

      {value.type === "check" && <CheckIcon />}
      {value.type === "dash" && <span style={{ color: "var(--muted)" }}>—</span>}
      {value.type === "qual" && (
        <span className="font-mono text-[12px] tracking-[.02em]" style={{ color: "var(--stone)" }}>
          {value.text}
        </span>
      )}
    </div>
  );
}

export function FeatureCompare() {
  return (
    <section className="pb-20 md:pb-24" id="compare">
      <div className="mx-auto max-w-[1180px] px-6">
        <Reveal className="mb-9">
          <SectionLabel className="mb-[18px]">O que está incluso</SectionLabel>
          <h2
            className="font-medium tracking-[-0.025em] mb-3.5"
            style={{ fontSize: "clamp(28px, 3.6vw, 40px)", lineHeight: 1.1, color: "var(--ink)" }}
          >
            O que cabe em cada plano
          </h2>
          <p className="text-base font-light leading-relaxed max-w-[620px]" style={{ color: "var(--stone)" }}>
            Cinco frentes da gestão da igreja, lado a lado. Sem categoria "Enterprise" escondendo o que importa.
          </p>
        </Reveal>

        <Reveal>
          <div
            className="rounded-[14px] border overflow-hidden"
            style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-sm)" }}
          >
            {GROUPS.map((group, gi) => (
              <div
                key={group.heading}
                className={gi > 0 ? "border-t-2" : ""}
                style={{ borderColor: "var(--border-strong)" }}
              >
                {/* Group header */}
                <div
                  className="px-5 md:px-7 py-4 grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1fr]"
                  style={{ background: "var(--subtle)" }}
                >
                  <div className="font-mono text-[11px] uppercase tracking-[.14em] font-medium" style={{ color: "var(--stone)" }}>
                    {group.heading}
                  </div>
                  <div className="hidden md:block font-mono text-[11px] uppercase tracking-[.14em] font-medium" style={{ color: "var(--stone)" }}>
                    Starter
                  </div>
                  <div className="hidden md:block font-mono text-[11px] uppercase tracking-[.14em] font-medium" style={{ color: "var(--navy-accent)" }}>
                    Premium
                  </div>
                </div>

                {/* Rows */}
                {group.rows.map((row, ri) => (
                  <div
                    key={row.feature}
                    className="border-t grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1fr]"
                    style={{
                      background: ri % 2 === 0 ? "var(--surface)" : "var(--sand-soft)",
                      borderColor: "var(--border)",
                    }}
                  >
                    <div
                      className="px-5 md:px-7 py-3 md:py-4 text-[14.5px] font-medium"
                      style={{ color: "var(--ink)" }}
                    >
                      {row.feature}
                    </div>
                    <Cell value={row.starter} variant="starter" mobileLabel="Starter" />
                    <Cell value={row.premium} variant="premium" mobileLabel="Premium" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
