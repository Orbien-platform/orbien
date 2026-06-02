import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { FaqItem } from "@/components/ui/FaqItem";

const FAQS = [
  {
    q: "O membro precisa baixar algum app específico?",
    a: "Sim, o app da sua igreja — disponível na App Store e Google Play. No plano Starter, é o app Orbien com a identidade visual da sua igreja. No Premium, é um app publicado com o nome e ícone da própria igreja, sem menção à Orbien.",
  },
  {
    q: "Posso programar devocionais para o mês inteiro de uma vez?",
    a: "Sim. Você escreve ou importa todos os devocionais do mês no painel e define a data e o horário de cada publicação. O sistema publica automaticamente — sem precisar entrar no painel todo dia.",
  },
  {
    q: "Os membros recebem notificação mesmo com o app fechado?",
    a: "Sim. As notificações push chegam no celular independentemente de o app estar aberto — como qualquer outro app de mensagens. Notificações entre 22h e 7h são bloqueadas automaticamente.",
  },
  {
    q: "Como funciona o pedido de oração privado?",
    a: "O membro pode marcar o pedido como privado. Nesse caso, só a liderança vê — o pedido não aparece no feed geral da comunidade. O membro decide a visibilidade antes de publicar.",
  },
  {
    q: "Consigo saber quantas pessoas leram o aviso?",
    a: "Sim, no plano Premium. O painel mostra quantos membros receberam, abriram e leram a mensagem até o fim — com percentual de abertura por segmento. No Starter, o envio é feito sem métricas de leitura.",
  },
  {
    q: "Posso agendar um aviso para publicar em um horário específico?",
    a: "Sim. Ao criar um comunicado ou devocional, você escolhe \"Publicar agora\" ou define data e hora de publicação. Útil para programar o aviso do culto na sexta para chegar no sábado de manhã.",
  },
] as const;

export function ConteudosFaq() {
  return (
    <section className="py-20 md:py-24">
      <div className="mx-auto max-w-[1180px] px-6">
        <Reveal className="mb-12">
          <SectionLabel className="mb-[18px]">Dúvidas</SectionLabel>
          <h2
            className="font-medium tracking-[-0.025em]"
            style={{ fontSize: "clamp(30px, 4.2vw, 44px)", lineHeight: 1.1, color: "var(--ink)" }}
          >
            Perguntas sobre conteúdos e notificações.
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
