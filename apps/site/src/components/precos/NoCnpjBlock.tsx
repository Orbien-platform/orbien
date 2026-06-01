import Link from "next/link";

const STATS = [
  "PIX cai direto na chave da igreja",
  "Orbien não toca no dinheiro",
  "Migração pro Premium em 15 min",
];

export function NoCnpjBlock() {
  return (
    <section
      className="relative overflow-hidden py-[72px]"
      style={{ background: "#1E3A7B", color: "#fff" }}
    >
      {/* Gradient overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 90% 10%, rgba(0,184,162,.18), transparent 55%), radial-gradient(circle at 5% 95%, rgba(255,255,255,.05), transparent 50%)",
        }}
      />

      <div className="relative mx-auto max-w-[1180px] px-6">
        <div
          className="grid grid-cols-1 gap-8 items-center md:gap-14"
          style={{ gridTemplateColumns: "1.3fr 1fr" } as React.CSSProperties}
        >
          {/* Left */}
          <div>
            <p
              className="inline-flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[.14em] mb-[18px]"
              style={{ color: "rgba(255,255,255,.7)" }}
            >
              <span className="w-6 h-px" style={{ background: "rgba(255,255,255,.4)" }} />
              Antes da formalização
            </p>
            <h2
              className="font-semibold text-white mb-4 tracking-[-0.025em]"
              style={{ fontSize: "clamp(28px, 3.6vw, 38px)", lineHeight: 1.1 }}
            >
              Sua igreja ainda não tem CNPJ?
            </h2>
            <p
              className="text-[17px] font-light leading-relaxed mb-6 max-w-[480px]"
              style={{ color: "rgba(255,255,255,.78)" }}
            >
              O Starter foi feito pra você. Comece hoje, formalize depois — a gente faz a transição sem complicação.
            </p>
            <Link
              href="/sem-cnpj"
              className="inline-flex h-12 items-center gap-2 rounded-btn bg-white px-6 text-[15px] font-medium transition-all hover:-translate-y-px"
              style={{ color: "#1E3A7B" }}
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
              background: "rgba(255,255,255,.06)",
              border: "1px solid rgba(255,255,255,.12)",
              backdropFilter: "blur(20px)",
            }}
          >
            {STATS.map((stat, i) => (
              <div
                key={stat}
                className={`flex items-center gap-3 py-2.5 ${i > 0 ? "border-t" : ""}`}
                style={{ borderColor: "rgba(255,255,255,.08)" }}
              >
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(0,205,181,.2)", color: "#00CDB5" }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <span className="text-[14.5px]" style={{ color: "rgba(255,255,255,.9)" }}>
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
