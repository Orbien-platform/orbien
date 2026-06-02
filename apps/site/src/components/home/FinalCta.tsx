import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";

export function FinalCta() {
  return (
    <section
      className="relative overflow-hidden border-y py-24"
      id="waitlist"
      style={{ background: "var(--on-ink)", borderColor: "var(--border)" }}
    >
      {/* Radial gradients */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 80% 20%, rgba(30,58,123,.35), transparent 50%), radial-gradient(circle at 10% 90%, rgba(0,184,162,.15), transparent 50%)",
        }}
      />

      <div className="relative mx-auto max-w-[1180px] px-6">
        <Reveal className="max-w-[720px]">
          <SectionLabel className="mb-5" color="#00B8A2">Lista de espera aberta</SectionLabel>
          <h2
            className="font-semibold tracking-[-0.03em] mb-[18px] text-white"
            style={{ fontSize: "clamp(32px, 5vw, 56px)", lineHeight: 1.05 }}
          >
            Pronto pra ver na sua igreja?
          </h2>
          <p
            className="text-lg font-light leading-[1.55] mb-8 max-w-[540px]"
            style={{ color: "#BFC0C9" }}
          >
            Entre na lista de espera e a gente te chama assim que abrir a primeira leva de igrejas-piloto.
          </p>
          <div className="flex gap-4 items-center flex-wrap">
            <a
              href="#"
              className="inline-flex h-12 items-center gap-2 rounded-btn bg-teal px-6 text-[15px] font-medium text-white transition-all hover:bg-teal-dark hover:-translate-y-px"
            >
              Entrar na lista de espera
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
              </svg>
            </a>
            <a
              href="https://wa.me/5554999529683"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-normal text-white transition-colors hover:text-teal border-b border-white/25 pb-px hover:border-teal"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              Prefere conversar antes? Fale no WhatsApp →
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
