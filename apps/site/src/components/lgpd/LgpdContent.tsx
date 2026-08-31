import { SectionLabel } from "@/components/ui/SectionLabel";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-10 border-t" style={{ borderColor: "var(--border)" }}>
      <h2
        className="font-medium tracking-[-0.02em] mb-5"
        style={{ fontSize: "clamp(18px, 2.2vw, 22px)", color: "var(--ink)" }}
      >
        {title}
      </h2>
      <div
        className="text-[15px] font-light leading-[1.75] space-y-4 max-w-[680px]"
        style={{ color: "var(--stone)" }}
      >
        {children}
      </div>
    </div>
  );
}

function Strong({ children }: { children: React.ReactNode }) {
  return <strong className="font-medium" style={{ color: "var(--ink)" }}>{children}</strong>;
}

function Ul({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2 pl-1">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-[9px]"
            style={{ background: "var(--navy-accent)" }}
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function LgpdContent() {
  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto max-w-[1180px] px-6">
        <div className="max-w-[760px]">

          {/* Header */}
          <SectionLabel className="mb-7">Legal e privacidade</SectionLabel>
          <h1
            className="font-light tracking-[-0.035em] mb-5"
            style={{ fontSize: "clamp(38px, 5.5vw, 60px)", lineHeight: 1.04, color: "var(--ink)" }}
          >
            Política de{" "}
            <strong className="font-semibold" style={{ color: "var(--navy-accent)" }}>
              Privacidade e LGPD
            </strong>
          </h1>
          <p className="font-light leading-[1.65] mb-3" style={{ fontSize: "17px", color: "var(--stone)" }}>
            Orbien — Church Platform Ltda · Versão 1.0 · Última atualização: junho de 2026
          </p>
          <p className="font-light leading-[1.65]" style={{ fontSize: "15px", color: "var(--muted)" }}>
            Esta política descreve como a Church Platform Ltda ("Orbien") coleta, usa, armazena e protege os dados pessoais de acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).
          </p>

          {/* Sections */}
          <Section title="1. Controlador e Operador">
            <p>
              <Strong>Controlador dos dados:</Strong> A sua igreja (pessoa jurídica ou representante legal) é a controladora dos dados dos seus membros e visitantes. Ela define as finalidades e os meios de tratamento.
            </p>
            <p>
              <Strong>Operador dos dados:</Strong> A Church Platform Ltda (CNPJ a definir), com sede em Passo Fundo, RS, atua como operadora — processa os dados em nome da igreja, conforme as instruções desta e nos termos deste documento e do contrato de prestação de serviços.
            </p>
          </Section>

          <Section title="2. Dados coletados">
            <p>A Orbien coleta e processa as seguintes categorias de dados, conforme a finalidade de cada módulo:</p>
            <Ul items={[
              "Identificação: nome completo, telefone, e-mail",
              "Eclesiásticos: vínculo com a igreja (visitante, frequentador, membro), grupo, ministério, função",
              "Financeiros: histórico de doações, valor e data (sem dados bancários do doador — o PIX é processado diretamente pelo banco do doador)",
              "Comportamentais: presença em cultos e reuniões, leitura de devocionais e comunicados",
              "Técnicos: endereço IP, tipo de dispositivo e sistema operacional (para diagnóstico de erros e segurança)",
            ]} />
          </Section>

          <Section title="3. Bases legais para o tratamento">
            <p>O tratamento de dados pela Orbien se ampara nas seguintes bases legais previstas no art. 7º da LGPD:</p>
            <Ul items={[
              "Execução de contrato: tratamento necessário para a prestação dos serviços contratados pela igreja",
              "Legítimo interesse: análise de uso do produto para melhoria da plataforma, sem identificação individual dos titulares",
              "Consentimento: comunicados de marketing enviados diretamente ao membro (revogável a qualquer momento)",
            ]} />
          </Section>

          <Section title="4. Encarregado de Dados (DPO)">
            <p>
              Nos termos do art. 41 da LGPD, a Church Platform Ltda indica como Encarregado de Dados (Data Protection Officer):
            </p>
            <div
              className="rounded-[12px] border p-6 mt-2"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            >
              <p className="font-mono text-[11px] uppercase tracking-[.1em] mb-3" style={{ color: "var(--muted)" }}>Encarregado de Dados</p>
              <p className="text-[14.5px] font-medium mb-1" style={{ color: "var(--ink)" }}>Church Platform Ltda — DPO</p>
              <p className="text-[14px] font-light" style={{ color: "var(--stone)" }}>
                E-mail:{" "}
                <a href="mailto:privacidade@orbien.app" className="underline underline-offset-2" style={{ color: "var(--navy-accent)" }}>
                  privacidade@orbien.app
                </a>
              </p>
              <p className="text-[14px] font-light mt-0.5" style={{ color: "var(--stone)" }}>
                Endereço: Passo Fundo, RS — Brasil
              </p>
            </div>
            <p className="text-[13.5px]">
              Solicitações de titulares (acesso, correção, exclusão, portabilidade) devem ser enviadas para o e-mail acima com identificação suficiente do titular e da igreja vinculada. O prazo de resposta é de até 15 dias corridos.
            </p>
          </Section>

          <Section title="5. Direitos dos titulares">
            <p>Todo titular de dados pessoais tratados pela Orbien tem direito a:</p>
            <Ul items={[
              "Confirmação da existência de tratamento e acesso aos dados",
              "Correção de dados incompletos, inexatos ou desatualizados",
              "Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade com a LGPD",
              "Portabilidade dos dados a outro fornecedor de serviço",
              "Eliminação dos dados tratados com consentimento, mediante solicitação",
              "Informação sobre compartilhamento com terceiros",
              "Revogação do consentimento a qualquer momento",
            ]} />
            <p>
              O exercício dos direitos pode ser feito pelo próprio membro no app (perfil → configurações → privacidade) ou por solicitação ao Encarregado de Dados no endereço indicado na seção 4.
            </p>
          </Section>

          <Section title="6. Compartilhamento de dados">
            <p>Os dados não são vendidos a terceiros. O compartilhamento ocorre apenas nas seguintes situações:</p>
            <Ul items={[
              "Asaas (fintech parceira): dados mínimos para processamento de PIX dinâmico e recorrente no plano Premium — apenas com igrejas que contrataram esses recursos",
              "Infraestrutura de cloud: provedores de hospedagem com servidores no Brasil (região São Paulo) que atuam como suboperadores",
              "Autoridades públicas: quando exigido por lei ou ordem judicial",
            ]} />
          </Section>

          <Section title="7. Retenção e exclusão">
            <p>
              Os dados são mantidos enquanto o contrato de prestação de serviços estiver ativo. Após o encerramento, os dados são retidos por <Strong>90 dias</Strong> para possibilitar reativação e, em seguida, eliminados de forma segura, salvo obrigação legal de guarda por prazo maior (ex.: dados fiscais — 5 anos).
            </p>
            <p>
              A igreja pode solicitar a exportação completa dos dados (formato CSV/JSON) a qualquer momento pelo painel administrativo — sem custo adicional.
            </p>
          </Section>

          <Section title="8. Segurança">
            <Ul items={[
              "Dados armazenados em servidores no Brasil (São Paulo), com criptografia em repouso (AES-256) e em trânsito (TLS 1.3)",
              "Controle de acesso por função (RBAC) — cada cargo só acessa o que precisa",
              "Logs de auditoria para operações sensíveis (exportação, exclusão em massa)",
              "Política de senhas e autenticação com limite de tentativas",
            ]} />
          </Section>

          <Section title="9. Alterações nesta política">
            <p>
              Mudanças materiais serão comunicadas por e-mail com pelo menos <Strong>30 dias</Strong> de antecedência. O uso continuado do serviço após a data de vigência constitui aceite das novas condições.
            </p>
          </Section>

          <Section title="10. Contato">
            <p>
              Dúvidas sobre esta política:{" "}
              <a href="mailto:privacidade@orbien.app" className="underline underline-offset-2 transition-colors" style={{ color: "var(--navy-accent)" }}>
                privacidade@orbien.app
              </a>
            </p>
            <p>
              Para reclamações junto à autoridade nacional, acesse o site da{" "}
              <a
                href="https://www.gov.br/anpd"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 transition-colors"
                style={{ color: "var(--navy-accent)" }}
              >
                ANPD — Autoridade Nacional de Proteção de Dados
              </a>.
            </p>
          </Section>

        </div>
      </div>
    </section>
  );
}
