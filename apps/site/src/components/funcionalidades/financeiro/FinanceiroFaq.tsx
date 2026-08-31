import Link from "next/link";
import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { FaqItem } from "@/components/ui/FaqItem";

const FAQS = [
  {
    q: "Quanto a Orbien cobra sobre as doações?",
    a: "No PIX por chave manual (Starter e Premium): nada — o dinheiro vai direto para a chave da igreja, sem passar pela Orbien. No PIX dinâmico (Premium): ≈ 2% por transação, divididos entre Asaas (≈ 1%) e Orbien (1% de orquestração).",
  },
  {
    q: "O doador recebe comprovante automático?",
    a: "Sim. Assim que o PIX é confirmado, o sistema gera o recibo e envia por e-mail ou WhatsApp para o doador — sem nenhuma ação manual da tesoureira.",
  },
  {
    q: "Como funciona o dízimo recorrente?",
    a: "O membro entra no app, configura o valor do dízimo e o dia de vencimento. A partir daí, um PIX é gerado automaticamente todo mês naquela data. O membro recebe notificação push e e-mail de lembrete. Ele pode pausar ou cancelar a qualquer momento.",
  },
  {
    q: "Os dados financeiros são visíveis para todos os usuários do painel?",
    a: "Não. No Premium, as permissões são configuráveis por cargo: o pastor vê tudo, a tesoureira vê entradas e saídas, o líder de célula vê apenas as contribuições do próprio grupo. No Starter, todos os usuários do painel têm acesso igual.",
  },
  {
    q: "Posso exportar para o meu contador?",
    a: "Sim, no plano Premium. O sistema exporta em OFX (formato padrão bancário) e SPED (obrigação fiscal do governo). O contador importa diretamente no software de contabilidade dele — sem retrabalho.",
  },
  {
    q: "O que é o carnê do dizimista e para que serve?",
    a: "É um documento que comprova as contribuições do membro ao longo do ano, necessário para a dedução no Imposto de Renda (quando aplicável). O Orbien gera e entrega automaticamente pelo app em janeiro, para cada membro que contribuiu no ano anterior.",
  },
] as const;

export function FinanceiroFaq() {
  return (
    <section className="py-20 md:py-24">
      <div className="mx-auto max-w-[1180px] px-6">
        <Reveal className="mb-12">
          <SectionLabel className="mb-[18px]">Dúvidas</SectionLabel>
          <h2
            className="font-medium tracking-[-0.025em]"
            style={{ fontSize: "clamp(30px, 4.2vw, 44px)", lineHeight: 1.1, color: "var(--ink)" }}
          >
            Perguntas sobre o módulo financeiro.
          </h2>
        </Reveal>

        <div className="flex flex-col gap-2 max-w-[820px]">
          {FAQS.map(({ q, a }) => (
            <Reveal key={q}>
              <FaqItem q={q} a={a} />
            </Reveal>
          ))}
        </div>

        <div className="mt-6">
          <Link
            href="/precos#faq"
            className="inline-flex items-center text-sm font-medium transition-colors"
            style={{ color: "var(--stone)" }}
          >
            Ver perguntas sobre preços e contrato →
          </Link>
        </div>
      </div>
    </section>
  );
}
