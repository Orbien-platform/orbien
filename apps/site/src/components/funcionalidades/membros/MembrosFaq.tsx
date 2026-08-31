import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { FaqItem } from "@/components/ui/FaqItem";

const FAQS = [
  {
    q: "Tem limite de membros e visitantes cadastrados?",
    a: "Não. Os planos Starter e Premium têm cadastro ilimitado. O preço varia pela faixa de membros ativos — não pelo total de registros na base.",
  },
  {
    q: "Como funciona o QR code de entrada?",
    a: "Você gera o QR code no painel e imprime. Quando o visitante chega, ele escaneia com o celular, preenche nome e WhatsApp em uma tela simples e pronto — sem precisar de app ou cadastro prévio. O registro aparece no painel em tempo real.",
  },
  {
    q: "O que é deduplicação e como ela funciona?",
    a: "Deduplicação é a detecção automática de pessoas cadastradas mais de uma vez. O sistema cruza nome, telefone e e-mail. Quando encontra suspeita de duplicata, exibe um alerta com sugestão de mesclagem — você decide se confirma ou ignora.",
  },
  {
    q: "Posso importar minha lista atual de membros?",
    a: "Sim. O painel aceita importação via CSV. Para igrejas vindas de Eklesia, InPeace, In Church ou planilha, também oferecemos migração assistida — a Orbien faz a importação e validação junto com você.",
  },
  {
    q: "Quem pode ver os dados dos membros?",
    a: "No Starter, todos os usuários do painel têm acesso igual. No Premium, você define permissões por cargo: o pastor vê tudo, a secretária vê cadastro e presença, o líder de célula vê só o próprio grupo.",
  },
  {
    q: "O membro vê os próprios dados no app?",
    a: "Sim. No app, o membro acessa o próprio perfil, histórico de presença, pedidos de oração e contribuições. Ele não vê dados de outros membros.",
  },
] as const;

export function MembrosFaq() {
  return (
    <section className="py-20 md:py-24">
      <div className="mx-auto max-w-[1180px] px-6">
        <Reveal className="mb-12">
          <SectionLabel className="mb-[18px]">Dúvidas</SectionLabel>
          <h2
            className="font-medium tracking-[-0.025em]"
            style={{ fontSize: "clamp(30px, 4.2vw, 44px)", lineHeight: 1.1, color: "var(--ink)" }}
          >
            Perguntas sobre o módulo de membros.
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
