import Image from "next/image";
import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { CheckIcon } from "@/components/ui/CheckIcon";

const REPORT_ITEMS = [
  { label: "Total arrecadado",   value: "R$ 4.820,00",  delta: "+14% vs semana ant." },
  { label: "Doadores únicos",    value: "34",            delta: "+3 novos este mês"   },
  { label: "Dizimistas ativos",  value: "68%",           delta: "meta: 70%"           },
  { label: "Maior doação",       value: "R$ 500,00",     delta: "doação pontual"      },
] as const;

export function RelatorioSemanal() {
  return (
    <section className="py-20 md:py-24" style={{ background: "var(--subtle)" }}>
      <div className="mx-auto max-w-[1180px] px-6">
        <div className="grid grid-cols-1 gap-14 items-center md:grid-cols-[1fr_1fr] md:gap-16">
          {/* Left — text */}
          <Reveal>
            <SectionLabel className="mb-[18px]">Relatório semanal</SectionLabel>
            <h2
              className="font-medium tracking-[-0.025em] mb-5"
              style={{ fontSize: "clamp(28px, 3.8vw, 42px)", lineHeight: 1.1, color: "var(--ink)" }}
            >
              A tesoureira abre a segunda-feira e já tem tudo.
            </h2>
            <p className="text-[16px] font-light leading-relaxed mb-8 max-w-[460px]" style={{ color: "var(--stone)" }}>
              Todo início de semana, um resumo financeiro completo é gerado e enviado por e-mail — sem ninguém precisar entrar no sistema para gerar nada.
            </p>

            <div className="flex flex-col gap-3.5">
              {[
                "Total de entradas e saídas no período",
                "Comparativo com a semana anterior",
                "Lista de novos doadores e dizimistas",
                "Alertas de inadimplência (dízimo atrasado)",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <span className="mt-0.5">
                    <CheckIcon />
                  </span>
                  <span className="text-[14.5px] font-light" style={{ color: "var(--stone)" }}>{item}</span>
                </div>
              ))}
            </div>
          </Reveal>

          {/* Right — report card mockup */}
          <Reveal>
            <div
              className="rounded-[14px] overflow-hidden border"
              style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-md)" }}
            >
              {/* Email-style header */}
              <div
                className="px-6 py-5 border-b"
                style={{ background: "var(--subtle)", borderColor: "var(--border)" }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-7 h-7 rounded-[6px] flex items-center justify-center flex-shrink-0"
                    style={{ background: "var(--navy-accent)", color: "#fff" }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 3v18h18" /><path d="M7 16V9" /><path d="M12 16v-5" /><path d="M17 16V7" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold" style={{ color: "var(--ink)" }}>Relatório Semanal · Orbien</p>
                    <p className="font-mono text-[10px]" style={{ color: "var(--muted)" }}>noreply@orbien.app · para tesoureira@igrejadoca.com</p>
                  </div>
                </div>
                <p className="text-[13px] font-medium mt-3" style={{ color: "var(--ink)" }}>
                  Semana de 26 mai a 1 jun · Igreja da Graça
                </p>
              </div>

              {/* KPI grid */}
              <div className="grid grid-cols-2 gap-px" style={{ background: "var(--border)" }}>
                {REPORT_ITEMS.map(({ label, value, delta }) => (
                  <div key={label} className="px-5 py-4" style={{ background: "var(--surface)" }}>
                    <p className="font-mono text-[9px] uppercase tracking-[.06em] mb-1" style={{ color: "var(--muted)" }}>{label}</p>
                    <p className="font-mono text-[16px] font-medium tracking-[-0.02em]" style={{ color: "var(--ink)" }}>{value}</p>
                    <p className="font-mono text-[9px] mt-0.5" style={{ color: "#00B8A2" }}>{delta}</p>
                  </div>
                ))}
              </div>

              {/* next/image placeholder — área reservada para screenshot real do relatório */}
              <div className="relative border-t" style={{ borderColor: "var(--border)" }}>
                <Image
                  src="/placeholder-membros-painel.svg"
                  alt="Screenshot do relatório financeiro semanal mostrando gráfico de barras com arrecadação diária, lista de doadores e indicadores de dizimistas"
                  width={640}
                  height={120}
                  className="w-full"
                  style={{ display: "block", opacity: 0.45 }}
                  priority={false}
                />
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ background: "linear-gradient(to bottom, transparent 30%, var(--surface))" }}
                >
                  <span
                    className="font-mono text-[10px] uppercase tracking-[.12em] px-3 py-1.5 rounded-pill"
                    style={{ background: "var(--subtle)", color: "var(--muted)", border: "1px solid var(--border)" }}
                  >
                    Gráfico de arrecadação
                  </span>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t flex items-center justify-between" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                <span className="font-mono text-[10px]" style={{ color: "var(--muted)" }}>Gerado automaticamente toda segunda-feira</span>
                <span className="font-mono text-[10px] font-medium" style={{ color: "var(--navy-accent)" }}>Exportar PDF</span>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
