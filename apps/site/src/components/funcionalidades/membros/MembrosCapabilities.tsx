import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";

const CAPABILITIES = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18" />
        <path d="M9 21V9" />
      </svg>
    ),
    title: "Cadastro em 30 segundos",
    body: "Imprima o QR code e cole na entrada. O visitante escaneia, preenche nome e WhatsApp no celular. Cadastrado antes de sentar.",
    highlight: "QR code gerado pelo painel, sem app",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </svg>
    ),
    title: "Deduplicação inteligente",
    body: "Mesmo nome com telefones diferentes? O sistema detecta, alerta e propõe a mesclagem. Sem duplicatas silenciosas na base.",
    highlight: "Cruzamento por nome + telefone + e-mail",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" /><path d="M7 16V9" /><path d="M12 16v-5" /><path d="M17 16V7" />
      </svg>
    ),
    title: "Acompanhamento de presença",
    body: "Veja quem não aparece há mais de duas semanas. Gere a lista de follow-up e assigne ao líder de célula com um toque.",
    highlight: "Alerta automático por ausência prolongada",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: "Perfil completo do membro",
    body: "Foto, grupos, ministérios, histórico de presença e contribuições em um só lugar. O pastor vê o contexto antes de ligar.",
    highlight: "Histórico desde o primeiro dia",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
    title: "Integração WhatsApp",
    body: "Envie mensagem de boas-vindas pro visitante, alerte o líder de célula e confirme presença — tudo pelo WhatsApp sem sair do painel.",
    highlight: "Template de mensagem configurável",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
    title: "Ministérios e funções",
    body: "Atribua membros a ministérios, defina funções e controle quem tem acesso ao quê. A estrutura da sua igreja refletida no sistema.",
    highlight: "Permissões por cargo no Premium",
  },
] as const;

export function MembrosCapabilities() {
  return (
    <section className="py-20 md:py-24">
      <div className="mx-auto max-w-[1180px] px-6">
        <Reveal className="mb-12">
          <SectionLabel className="mb-[18px]">O que o módulo faz</SectionLabel>
          <h2
            className="font-medium tracking-[-0.025em] mb-3.5"
            style={{ fontSize: "clamp(30px, 4.2vw, 44px)", lineHeight: 1.1, color: "var(--ink)" }}
          >
            Seis recursos que a secretária vai usar toda semana.
          </h2>
          <p className="text-[17px] font-light leading-relaxed max-w-[580px]" style={{ color: "var(--stone)" }}>
            Do cadastro rápido na porta até o acompanhamento de quem sumiu — tudo em um módulo.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {CAPABILITIES.map(({ icon, title, body, highlight }) => (
            <Reveal key={title}>
              <div
                className="card-hover rounded-card border p-7 h-full flex flex-col gap-4"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                <div
                  className="w-11 h-11 rounded-[10px] flex items-center justify-center flex-shrink-0"
                  style={{ background: "var(--navy-tint)", color: "var(--navy-accent)" }}
                >
                  {icon}
                </div>
                <div className="flex flex-col gap-2 flex-1">
                  <h3 className="text-[16px] font-semibold tracking-[-0.018em]" style={{ color: "var(--ink)" }}>
                    {title}
                  </h3>
                  <p className="flex-1 text-[14px] font-light leading-relaxed" style={{ color: "var(--stone)" }}>
                    {body}
                  </p>
                </div>
                <p
                  className="font-mono text-[10px] uppercase tracking-[.08em]"
                  style={{ color: "var(--navy-accent)" }}
                >
                  {highlight}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
