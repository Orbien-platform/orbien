import Link from "next/link";
import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { FaqItem } from "@/components/ui/FaqItem";

const FAQS = [
  {
    q: "Por que não preciso de CNPJ pra usar o Starter?",
    a: "No Starter, as doações via PIX vão direto pra chave da sua igreja — CPF, telefone ou e-mail. A Orbien é a plataforma de gestão, não a intermediária financeira. Sem conta da Orbien envolvida, não há exigência de CNPJ.",
  },
  {
    q: "Como o membro faz a doação sem CNPJ?",
    a: "Ele abre o app, toca em 'Fazer doação', digita o valor e confirma o PIX. O dinheiro vai direto pra chave que você configurou. O recibo sai automaticamente pro e-mail ou WhatsApp dele.",
  },
  {
    q: "A Orbien fica com alguma porcentagem das doações?",
    a: "Não. A assinatura do Starter é a mensalidade fixa da plataforma — o que o membro doa vai 100% pra sua igreja. A Orbien não cobra nada sobre as transações.",
  },
  {
    q: "Quando formalizar, preciso recriar tudo?",
    a: "Não. A migração pro Premium mantém todos os membros, histórico financeiro e configurações. Você atualiza a chave PIX pro CNPJ, escolhe o plano Premium e pronto — em 15 minutos.",
  },
  {
    q: "O app fica no nome da minha igreja mesmo sem CNPJ?",
    a: "No Starter, o app usa a identidade visual da sua igreja (logo e cores), mas é publicado nas lojas pela Orbien. Pra publicar no nome da sua igreja — com um ícone e nome próprio na App Store — é necessário o plano Premium, que exige CNPJ ou representante legal.",
  },
  {
    q: "Os dados dos membros ficam seguros?",
    a: "Sim. Servidores no Brasil (São Paulo), em conformidade com a LGPD. A sua igreja é controladora dos dados, a Orbien é operadora. Você pode exportar ou excluir qualquer dado a qualquer momento.",
  },
] as const;

export function SemCnpjFaq() {
  return (
    <section className="py-20 md:py-24">
      <div className="mx-auto max-w-[1180px] px-6">
        <Reveal className="mb-12">
          <SectionLabel className="mb-[18px]">Dúvidas frequentes</SectionLabel>
          <h2
            className="font-medium tracking-[-0.025em]"
            style={{ fontSize: "clamp(30px, 4.2vw, 44px)", lineHeight: 1.1, color: "var(--ink)" }}
          >
            As perguntas que toda igreja sem CNPJ faz.
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
            Ver todas as perguntas →
          </Link>
        </div>
      </div>
    </section>
  );
}
