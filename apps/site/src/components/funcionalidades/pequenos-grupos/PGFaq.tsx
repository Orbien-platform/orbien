import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { FaqItem } from "@/components/ui/FaqItem";

const FAQS = [
  {
    q: "Posso chamar de EBD, ministério ou discipulado em vez de célula?",
    a: "Sim. A terminologia é configurável pela sua igreja. Você define o nome que quer usar — o sistema adapta todos os textos, notificações e relatórios para o termo que sua tradição usa.",
  },
  {
    q: "O líder precisa ter smartphone para usar?",
    a: "Sim, o registro de presença e o recebimento de materiais são feitos pelo app. O líder instala o app da sua igreja, faz login com o acesso que você configura e está pronto. Não precisa de nenhum treinamento específico.",
  },
  {
    q: "Como funciona o agendamento de materiais?",
    a: "Você carrega o conteúdo (PDF, link, texto) no painel e define a data de cada encontro. Na data certa, o material aparece automaticamente para o líder e para os membros do grupo no app — sem ninguém precisar enviar nada manualmente.",
  },
  {
    q: "O semáforo de saúde está disponível no Starter?",
    a: "Não. O semáforo automático (verde/amarelo/vermelho) é exclusivo do plano Premium. No Starter, você acessa o cadastro dos grupos, o histórico de presença e os materiais, mas sem o indicador automático de saúde.",
  },
  {
    q: "Quantos grupos posso criar?",
    a: "Não há limite de grupos em nenhum plano. Crie quantas células, PGs ou ministérios sua igreja precisar.",
  },
  {
    q: "O que acontece quando o líder não registra a presença?",
    a: "O sistema envia um lembrete push 24 horas após a data do encontro. Se a presença não for registrada em 48 horas, o grupo entra automaticamente no estado amarelo e o pastor recebe uma notificação.",
  },
] as const;

export function PGFaq() {
  return (
    <section className="py-20 md:py-24" style={{ background: "var(--subtle)" }}>
      <div className="mx-auto max-w-[1180px] px-6">
        <Reveal className="mb-12">
          <SectionLabel className="mb-[18px]">Dúvidas</SectionLabel>
          <h2
            className="font-medium tracking-[-0.025em]"
            style={{ fontSize: "clamp(30px, 4.2vw, 44px)", lineHeight: 1.1, color: "var(--ink)" }}
          >
            Perguntas sobre pequenos grupos.
          </h2>
        </Reveal>

        <div className="flex flex-col gap-2 max-w-[820px]">
          {FAQS.map(({ q, a }) => (
            <Reveal key={q}>
              <FaqItem q={q} a={a} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
