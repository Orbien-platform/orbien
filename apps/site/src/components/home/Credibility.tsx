export function Credibility() {
  return (
    <section
      className="py-8 border-y"
      style={{ background: "var(--sand)", borderColor: "var(--border)" }}
    >
      <div className="mx-auto max-w-[1180px] px-6 flex items-center justify-between gap-7 flex-wrap">
        <p className="text-[15px] italic" style={{ color: "var(--ink)", maxWidth: "360px" }}>
          <span style={{ color: "var(--navy-accent)", fontWeight: 600 }}>"</span>
          Feito com pastores, para pastores.
          <span style={{ color: "var(--navy-accent)", fontWeight: 600 }}>"</span>
        </p>
        <span
          className="inline-flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[.14em]"
          style={{ color: "var(--stone)" }}
        >
          <span className="w-5 h-px" style={{ background: "var(--stone)" }} />
          Em desenvolvimento com igrejas de Passo Fundo · RS
        </span>
      </div>
    </section>
  );
}
