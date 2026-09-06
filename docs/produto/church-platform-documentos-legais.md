# Documentos Legais — Church Platform
**Versão:** 0.1 — rascunho para revisão jurídica
**Data:** maio de 2026
**Status:** ⚠️ Este documento requer revisão por advogado especializado em LGPD e direito digital antes de qualquer uso.

---

> **Aviso importante:** os documentos a seguir são rascunhos elaborados para fins de estruturação e referência. Não constituem aconselhamento jurídico. Cláusulas marcadas com `[REVISÃO JURÍDICA OBRIGATÓRIA]` envolvem decisões ou riscos que exigem validação profissional antes da publicação.

---

# Documento 1 — Termos de Uso para a Igreja Contratante (B2B)

**Church Platform — Plataforma de Gestão de Igrejas**
Versão 0.1 | Vigência a partir de: [data de publicação]

---

## 1. Das Partes e do Objeto

**1.1** Estes Termos de Uso ("Termos") regulam a relação entre a **[Razão Social da Plataforma]**, inscrita no CNPJ sob o nº [CNPJ], com sede em [endereço] ("Church Platform" ou "Plataforma"), e a pessoa jurídica ou pessoa física responsável pela contratação do serviço ("Igreja Contratante" ou "Cliente").

**1.2** A Church Platform disponibiliza um sistema SaaS (Software as a Service) white-label de gestão de igrejas, composto por módulos de gestão de membros e voluntários, financeiro, pequenos grupos e conteúdos e notificações ("Serviço").

**1.3** Ao concluir o cadastro e aceitar estes Termos, a Igreja Contratante declara ter lido, compreendido e concordado com todas as condições aqui estabelecidas, bem como com a Política de Privacidade da Plataforma.

**1.4** Estes Termos devem ser lidos em conjunto com o Contrato de Prestação de Serviços assinado entre as partes, o qual prevalece em caso de conflito.

---

## 2. Dos Planos e Funcionalidades

**2.1** O Serviço é disponibilizado nos seguintes planos:

**Plano Starter:**
- Acesso a todos os módulos do MVP
- App mobile com identidade visual personalizada (logo, cores, nome) operando sob subdomínio da Plataforma (ex: `igrejaxyz.churchplatform.com.br`)
- Doação via chave PIX manual (sem processamento automático)
- Sem domínio próprio
- Sem publicação do app nas lojas com conta da própria igreja

**Plano Premium:**
- Todas as funcionalidades do Starter
- Domínio próprio (`app.suaigreja.com.br`) — ver item 2.2
- App publicado nas lojas (App Store e Google Play) com a conta da própria igreja
- PIX dinâmico com QR code identificado, confirmação automática e recibo digital (via Asaas)
- Doação recorrente via PIX Automático
- Build dedicado por tenant via EAS (Expo Application Services)
- Tipografia personalizada

**2.2** No Plano Premium, o domínio próprio é de responsabilidade exclusiva da Igreja Contratante: aquisição, renovação, manutenção e custos associados. A Church Platform realiza apenas a configuração técnica do apontamento DNS. A não renovação do domínio pela Igreja Contratante pode resultar em indisponibilidade do serviço, sem responsabilidade da Plataforma.

**2.3** `[REVISÃO JURÍDICA OBRIGATÓRIA]` A descrição detalhada de funcionalidades, limites de uso (número de membros, notificações, armazenamento) e condições de upgrade ou downgrade de plano constam no Contrato de Prestação de Serviços.

---

## 3. Das Obrigações da Church Platform

**3.1** A Church Platform se compromete a:

a) Disponibilizar o Serviço conforme as especificações do plano contratado;

b) Manter disponibilidade mínima do Serviço conforme SLA definido no Contrato de Prestação de Serviços `[REVISÃO JURÍDICA OBRIGATÓRIA — definir % de uptime e janelas de manutenção]`;

c) Realizar backups periódicos dos dados armazenados na plataforma `[REVISÃO JURÍDICA OBRIGATÓRIA — definir frequência e retenção de backups]`;

d) Adotar medidas técnicas e organizacionais adequadas para proteção dos dados processados, conforme a Lei nº 13.709/2018 (LGPD);

e) Notificar a Igreja Contratante em até 72 (setenta e duas) horas em caso de incidente de segurança que envolva dados de seus membros, conforme Art. 48 da LGPD;

f) Atuar como **operadora de dados** nos termos da LGPD, processando os dados dos membros da Igreja Contratante exclusivamente conforme as instruções desta e para as finalidades previstas nestes Termos e no Contrato.

**3.2** A Church Platform não se responsabiliza por:

a) Indisponibilidades causadas por falhas em serviços de terceiros (provedores de infraestrutura, Asaas, operadoras de telecomunicações);

b) Uso indevido do Serviço pela Igreja Contratante ou por seus usuários;

c) Perda de dados decorrente de ação ou omissão da Igreja Contratante.

---

## 4. Das Obrigações da Igreja Contratante

**4.1** A Igreja Contratante se compromete a:

a) Manter seus dados cadastrais atualizados na plataforma;

b) Utilizar o Serviço exclusivamente para as finalidades previstas nestes Termos;

c) Não ceder, sublicenciar, revender ou transferir o acesso ao Serviço a terceiros sem autorização prévia e escrita da Church Platform;

d) Garantir que todos os usuários administradores (secretaria, tesoureiro, líderes) conheçam e respeitem estes Termos e a Política de Privacidade;

e) Atuar como **controladora de dados** dos seus membros nos termos da LGPD, sendo responsável pela coleta, pelo tratamento e pela resposta a direitos dos titulares;

f) Obter o consentimento adequado dos responsáveis legais antes de cadastrar dados de menores de 18 anos na plataforma, conforme Art. 14 da LGPD;

g) Não utilizar o Serviço para coletar dados de membros sem o consentimento exigido pela LGPD;

h) Manter a confidencialidade das credenciais de acesso dos seus administradores.

**4.2** No Plano Premium com domínio próprio: manter o domínio ativo e renovado é responsabilidade exclusiva da Igreja Contratante (ver item 2.2).

---

## 5. Do Processamento de Pagamentos via PIX

**5.1** No Plano Starter, o Serviço exibe a chave PIX cadastrada pela Igreja Contratante para que os membros realizem transferências diretamente pelo aplicativo bancário de sua preferência. A Church Platform não intermedia, processa nem tem acesso a esses valores.

**5.2** No Plano Premium, o processamento de pagamentos via PIX dinâmico é realizado pela **Asaas Gestão Financeira Institucional Ltda.** ("Asaas"), suboperadora contratada pela Church Platform. A relação financeira das transações ocorre entre a Igreja Contratante e a Asaas, sujeita aos termos de uso da Asaas.

**5.3** `[REVISÃO JURÍDICA OBRIGATÓRIA]` A Church Platform retém uma taxa sobre as transações processadas via Asaas conforme definido no Contrato de Prestação de Serviços. A responsabilidade sobre a correta destinação dos valores recebidos é exclusiva da Igreja Contratante perante seus membros e doadores.

**5.4** A Church Platform não é instituição financeira e não realiza atividade de pagamento regulada pelo Banco Central do Brasil. O processamento é intermediado pela Asaas, que detém as autorizações regulatórias aplicáveis.

---

## 6. Do White-label e da Identidade Visual

**6.1** A personalização visual (logo, cores, nome, ícone) disponível no Serviço não transfere titularidade de marca da Church Platform para a Igreja Contratante.

**6.2** A Igreja Contratante é responsável por garantir que possui os direitos sobre os elementos visuais (logo, imagens) que uploada na plataforma, isentando a Church Platform de qualquer responsabilidade por violação de direitos de terceiros.

**6.3** No Plano Starter, o app é operado sob infraestrutura da Church Platform. O rodapé do painel web e do app exibirá a indicação "Desenvolvido por Church Platform", salvo acordo escrito em contrário.

**6.4** No Plano Premium, o app é publicado com a marca da Igreja Contratante, mas continua sendo operado tecnicamente pela Church Platform. A relação de operação técnica deve ser informada aos usuários finais conforme exigência regulatória aplicável `[REVISÃO JURÍDICA OBRIGATÓRIA]`.

---

## 7. Da Proteção de Dados (DPA — Data Processing Agreement)

**7.1** Para fins da LGPD (Lei nº 13.709/2018):

- A **Igreja Contratante** é a **controladora** dos dados pessoais dos seus membros, visitantes e frequentadores;
- A **Church Platform** é a **operadora**, processando esses dados apenas conforme as instruções da Igreja Contratante e para as finalidades previstas neste instrumento.

**7.2** Os dados pessoais tratados pela Church Platform no âmbito do Serviço incluem, sem limitação: nome, telefone, e-mail, endereço, data de nascimento, estado civil, profissão, foto, dados eclesiásticos (data de batismo, membresia, denominação), dados de contribuição financeira e dados de participação em grupos.

**7.3** Os dados referidos no item 7.2 incluem **dados sensíveis** nos termos do Art. 5º, II da LGPD — especificamente dados de convicção religiosa. A Igreja Contratante é responsável por garantir base legal adequada (Art. 11 da LGPD) para o tratamento desses dados.

**7.4** A Church Platform utiliza os seguintes **suboperadores** no processamento dos dados:

| Suboperador | Finalidade | Localização dos dados |
|---|---|---|
| Supabase (Postgres) | Banco de dados principal | Brasil (sa-east-1) |
| Render Services, Inc. | Hospedagem do backend | EUA (Oregon) `[REVISÃO — confirmar se cobertura de cláusulas contratuais padrão já foi formalizada com a Render]` |
| Vercel | Hospedagem do frontend | `[REVISÃO — confirmar região]` |
| Cloudflare R2 | Armazenamento de mídia e documentos | Edge global / Brasil |
| Asaas | Processamento de pagamentos PIX | Brasil |
| OneSignal | Disparo de notificações push | EUA `[REVISÃO JURÍDICA OBRIGATÓRIA — transferência internacional]` |

**7.5** `[REVISÃO JURÍDICA OBRIGATÓRIA]` A transferência de dados para o OneSignal (EUA) deve ser coberta por cláusulas contratuais padrão ou outro mecanismo previsto no Art. 33 da LGPD.

**7.6** Após o encerramento do contrato, a Church Platform manterá os dados pelo prazo de **5 (cinco) anos**, findo o qual procederá à exclusão definitiva, salvo obrigação legal de retenção superior. Durante esse período, a Igreja Contratante pode solicitar a exportação dos dados a qualquer momento.

---

## 8. Do Cancelamento e Encerramento

**8.1** A Igreja Contratante pode cancelar o Serviço a qualquer tempo, conforme condições e prazos definidos no Contrato de Prestação de Serviços `[REVISÃO JURÍDICA OBRIGATÓRIA — definir prazo de aviso prévio e multa rescisória, se houver]`.

**8.2** Após o cancelamento, a Igreja Contratante terá acesso para exportação de seus dados pelo prazo de **30 (trinta) dias corridos**. Após esse prazo, os dados serão arquivados e mantidos pelo período previsto no item 7.6.

**8.3** Em caso de inadimplência, a Church Platform poderá suspender o acesso ao Serviço após notificação prévia `[REVISÃO JURÍDICA OBRIGATÓRIA — definir prazo de notificação]`.

---

## 9. Da Limitação de Responsabilidade

**9.1** `[REVISÃO JURÍDICA OBRIGATÓRIA]` A responsabilidade total da Church Platform perante a Igreja Contratante, em qualquer hipótese, fica limitada ao valor pago pelo Serviço nos últimos 12 (doze) meses anteriores ao evento gerador do dano.

**9.2** A Church Platform não responde por danos indiretos, lucros cessantes ou danos morais decorrentes do uso ou da impossibilidade de uso do Serviço.

---

## 10. Das Disposições Gerais

**10.1** Estes Termos são regidos pelas leis da República Federativa do Brasil.

**10.2** Fica eleito o foro da comarca de `[cidade — REVISÃO]` para dirimir quaisquer controvérsias decorrentes destes Termos, com renúncia a qualquer outro, por mais privilegiado que seja.

**10.3** A Church Platform pode atualizar estes Termos a qualquer tempo, com notificação prévia de **30 (trinta) dias** por e-mail ao responsável cadastrado. O uso continuado do Serviço após o prazo implica aceite das novas condições.

---

---

# Documento 2 — Termos de Uso para o Usuário Final (Membro / Visitante)

**[Nome do App da Igreja] — powered by Church Platform**
Versão 0.1 | Vigência a partir de: [data de publicação]

---

## 1. O que é este app e quem o oferece

Este aplicativo é oferecido pela **[Nome da Igreja]** ("sua Igreja") para facilitar sua participação na comunidade: acompanhar informações, registrar presença em grupos, receber avisos e, se desejar, contribuir financeiramente.

O app é desenvolvido e operado tecnicamente pela **Church Platform** ([site da plataforma]), que fornece a tecnologia à sua Igreja. A responsabilidade pelas informações e pelo uso dos seus dados é da sua Igreja.

Ao criar uma conta ou preencher qualquer formulário neste app, você concorda com estes Termos e com a nossa Política de Privacidade.

---

## 2. Para quem é este app

Este app é destinado a pessoas com **18 anos ou mais**. Se você tem menos de 18 anos, seu responsável legal precisa autorizar seu cadastro e uso. Para cadastro de crianças no ministério infantil, o responsável legal deve fornecer o consentimento diretamente à Igreja.

---

## 3. O que você pode fazer no app

Dependendo do que sua Igreja habilitou, você pode:

- Consultar sua ficha cadastral e manter seus dados atualizados
- Acompanhar a agenda e os avisos da Igreja
- Participar do seu grupo de célula ou pequeno grupo
- Acessar materiais de estudo e devocionais
- Registrar sua presença em cultos e eventos
- Fazer doações (dízimos e ofertas) de forma segura
- Receber notificações sobre escalas de voluntariado, aniversários e avisos importantes
- Visualizar seu histórico de contribuições

---

## 4. Sua conta e sua responsabilidade

**4.1** Você é responsável por manter sua senha em sigilo e por todas as ações realizadas com sua conta.

**4.2** Não compartilhe sua conta com outras pessoas. Se suspeitar de acesso não autorizado, avise imediatamente a secretaria da sua Igreja.

**4.3** As informações que você cadastra devem ser verdadeiras e atualizadas.

---

## 5. Doações e pagamentos

**5.1** Se sua Igreja habilitou doações pelo app, você pode contribuir com dízimos e ofertas diretamente pelo aplicativo.

**5.2** Dependendo do plano da sua Igreja:
- **Chave PIX manual:** o app exibe a chave PIX da Igreja e você faz a transferência pelo seu banco. A Church Platform não processa nem tem acesso a esses valores.
- **PIX dinâmico (QR code):** o pagamento é processado pela Asaas, parceira da Church Platform. Você receberá um recibo por e-mail após a confirmação.

**5.3** Eventuais dúvidas sobre valores, destinação das ofertas ou recibos devem ser direcionadas à sua Igreja.

**5.4** `[REVISÃO JURÍDICA OBRIGATÓRIA]` Doações realizadas pelo app não geram direito a reembolso, salvo erro técnico comprovado.

---

## 6. Conteúdos e propriedade intelectual

**6.1** Todo o conteúdo publicado pela Igreja no app (pregações, estudos, devocionais, imagens) é de propriedade da Igreja ou de seus autores. Você pode usar para fins pessoais e devocionais, mas não reproduzir ou distribuir sem autorização.

**6.2** Ao enviar fotos ou informações pelo app (ex: foto de perfil), você concede à Igreja o direito de usar esse conteúdo dentro da plataforma.

---

## 7. O que não é permitido

Você não pode usar o app para:

- Compartilhar conteúdo falso, ofensivo ou que viole direitos de terceiros
- Tentar acessar dados de outras pessoas
- Usar ferramentas automatizadas para extrair dados da plataforma
- Qualquer atividade ilegal

---

## 8. Notificações

O app pode enviar notificações push com avisos da Igreja, lembretes de escala, materiais novos e outras informações relevantes. Você pode gerenciar suas preferências de notificação nas configurações do app a qualquer momento.

---

## 9. Encerramento de conta

Você pode solicitar a exclusão da sua conta diretamente à secretaria da sua Igreja ou pelo app, se essa funcionalidade estiver disponível. Após a solicitação, seus dados serão tratados conforme a Política de Privacidade.

---

## 10. Alterações nestes Termos

Sua Igreja ou a Church Platform podem atualizar estes Termos. Você será avisado pelo app ou por e-mail com pelo menos **15 (quinze) dias** de antecedência. O uso continuado após esse prazo implica aceite.

---

## 11. Dúvidas

Para dúvidas sobre o app e seus dados, entre em contato com a secretaria da sua Igreja.
Para questões técnicas sobre a plataforma: **[e-mail de suporte da Church Platform]**

---

---

# Documento 3 — Política de Privacidade

**Church Platform — Plataforma de Gestão de Igrejas**
Aplicável a: plataforma web (painel administrativo) + app mobile white-label
Versão 0.1 | Vigência a partir de: [data de publicação]

---

## 1. Quem somos e o que fazemos com seus dados

A **Church Platform** ([razão social], CNPJ: [CNPJ]) é uma empresa de tecnologia que fornece software de gestão para igrejas. Nessa relação:

- Se você é **pastor, secretária, tesoureiro ou líder** acessando o painel web ou o app de gestão: seus dados são tratados pela Church Platform como **controladora**.
- Se você é **membro, frequentador ou visitante** usando o app da sua Igreja: seus dados são tratados pela sua Igreja como **controladora**, e pela Church Platform como **operadora** (ou seja, processamos seus dados a mando da Igreja, conforme as instruções dela).

Esta Política cobre ambos os casos.

---

## 2. Quais dados coletamos

### 2.1 Dados fornecidos por você ou pela Igreja

| Dado | Quem fornece | Finalidade |
|---|---|---|
| Nome completo | Você / Igreja | Identificação, comunicação |
| Telefone | Você / Igreja | Comunicação, deduplicação de cadastro |
| E-mail | Você / Igreja | Comunicação, notificações, recibos |
| Data de nascimento | Você / Igreja | Aniversários, faixas etárias |
| Endereço | Você / Igreja | Localização de células próximas |
| Foto | Você | Perfil |
| Estado civil, profissão | Você / Igreja | Perfil pastoral |
| Dados eclesiásticos (batismo, membresia, denominação anterior) | Igreja | Gestão pastoral |
| Dados financeiros (contribuições, dízimos, ofertas) | Gerados pelo uso | Relatórios financeiros, recibos |
| Participação em grupos e presença | Gerados pelo uso | Acompanhamento pastoral |
| Pedidos de oração | Você | Funcionalidade de intercessão |

### 2.2 Dados coletados automaticamente

| Dado | Finalidade |
|---|---|
| Endereço IP | Segurança, registro de consentimento LGPD |
| Dispositivo e sistema operacional | Suporte técnico, compatibilidade |
| Logs de acesso e uso | Segurança, auditoria |
| Token de dispositivo (push) | Envio de notificações |

### 2.3 Dados sensíveis (Art. 5º, II da LGPD)

Os dados de **convicção religiosa** (vinculação a uma Igreja, participação em grupos, dados eclesiásticos) são considerados dados sensíveis pela LGPD e recebem proteção adicional. Eles são tratados exclusivamente para as finalidades de gestão pastoral da Igreja e nunca serão utilizados para fins comerciais pela Church Platform.

---

## 3. Base legal para o tratamento

| Situação | Base legal (LGPD) |
|---|---|
| Cadastro e gestão de membros pela Igreja | Consentimento (Art. 7º, I) ou legítimo interesse da entidade religiosa (Art. 7º, IX) |
| Dados sensíveis (convicção religiosa) | Consentimento específico (Art. 11, I) ou exercício regular de direitos pela entidade religiosa (Art. 11, II, d) `[REVISÃO JURÍDICA OBRIGATÓRIA]` |
| Processamento de pagamentos PIX | Execução de contrato (Art. 7º, V) |
| Dados de crianças | Consentimento dos responsáveis legais (Art. 14 da LGPD) — responsabilidade da Igreja |
| Logs de segurança e auditoria | Legítimo interesse (Art. 7º, IX) |
| Cumprimento de obrigação legal | Art. 7º, II |

---

## 4. Com quem compartilhamos seus dados

A Church Platform não vende, aluga nem compartilha dados pessoais com terceiros para fins publicitários.

Os dados são compartilhados apenas com os seguintes **suboperadores**, necessários para o funcionamento do Serviço:

| Parceiro | Papel | Dado compartilhado |
|---|---|---|
| Supabase | Banco de dados (Postgres) — hospedado no Brasil | Todos os dados cadastrais |
| Render Services, Inc. | Hospedagem do servidor backend | Dados em trânsito |
| Vercel | Hospedagem do frontend web | Dados em trânsito |
| Cloudflare R2 | Armazenamento de arquivos e mídia | Fotos, documentos, PDFs |
| Asaas | Processamento de pagamentos PIX | Nome, e-mail, valor da transação |
| OneSignal | Envio de notificações push | Token de dispositivo, tags de segmentação (sem nome ou e-mail) `[REVISÃO JURÍDICA OBRIGATÓRIA — transferência internacional]` |

---

## 5. Seus direitos como titular de dados

Nos termos da LGPD (Art. 18), você tem direito a:

- **Confirmar** se tratamos seus dados
- **Acessar** os dados que temos sobre você
- **Corrigir** dados incompletos, inexatos ou desatualizados
- **Anonimizar, bloquear ou eliminar** dados desnecessários ou tratados em desconformidade
- **Portabilidade** dos seus dados em formato estruturado
- **Revogar o consentimento** a qualquer tempo
- **Eliminação** dos dados tratados com base no seu consentimento
- **Informação** sobre os terceiros com quem compartilhamos seus dados

**Como exercer seus direitos:** entre em contato com a secretaria da sua Igreja (para dados de membros) ou com a Church Platform pelo e-mail **[e-mail DPO/privacidade]** (para dados de administradores e questões técnicas).

`[REVISÃO JURÍDICA OBRIGATÓRIA]` A Church Platform deve indicar um Encarregado de Proteção de Dados (DPO) se o volume de dados sensíveis processados assim exigir — avaliar com advogado.

---

## 6. Segurança dos dados

Adotamos as seguintes medidas técnicas e organizacionais:

- Criptografia de senhas com Argon2 (sem armazenamento de senha em texto simples)
- Autenticação com JWT de curta duração + refresh token com rotação
- Row-Level Security (RLS) no banco de dados — cada Igreja acessa apenas seus próprios dados
- Comunicação via HTTPS/TLS em todas as camadas
- Backups periódicos com retenção controlada
- Controle de acesso por papéis e escopos (cada usuário vê apenas o que seu papel permite)
- Log imutável de ações administrativas (auditoria)

---

## 7. Retenção de dados

| Situação | Prazo de retenção |
|---|---|
| Conta ativa | Durante toda a vigência do contrato |
| Após cancelamento do contrato | 5 anos |
| Logs de segurança | `[REVISÃO — definir prazo]` |
| Dados de transações financeiras | Prazo legal aplicável (mínimo 5 anos — legislação fiscal brasileira) |

Após os prazos acima, os dados são eliminados de forma segura e irreversível.

---

## 8. Dados de crianças

A Church Platform não coleta dados de menores de 18 anos diretamente. Quando a Igreja cadastra dados de crianças no ministério infantil, é responsabilidade da Igreja obter o consentimento prévio e expresso dos responsáveis legais, nos termos do Art. 14 da LGPD.

---

## 9. Alterações desta Política

Podemos atualizar esta Política a qualquer momento. Notificaremos por e-mail (administradores) e por aviso no app (membros) com **30 dias de antecedência** para alterações relevantes.

---

## 10. Contato e canal de privacidade

Para exercer seus direitos ou esclarecer dúvidas sobre privacidade:

**E-mail:** [e-mail de privacidade]
**Endereço:** [endereço da empresa]
**Encarregado de Dados (DPO):** `[REVISÃO JURÍDICA OBRIGATÓRIA — nomear ou justificar dispensa]`

---

---

# Documento 4 — Política de Cookies

**Church Platform — Painel Administrativo Web**
Versão 0.1 | Vigência a partir de: [data de publicação]

---

## 1. O que são cookies

Cookies são pequenos arquivos de texto armazenados no seu navegador quando você acessa um site. Eles permitem que o site reconheça seu dispositivo e melhore sua experiência.

---

## 2. Cookies que utilizamos

### 2.1 Cookies estritamente necessários

Esses cookies são indispensáveis para o funcionamento do painel. Não podem ser desativados.

| Cookie | Finalidade | Duração |
|---|---|---|
| `auth_token` | Mantém sua sessão autenticada | Sessão / até o logout |
| `refresh_token` | Renova a sessão automaticamente | 7 dias (configurável) |
| `tenant_ctx` | Identifica a Igreja/congregação ativa | Sessão |
| `csrf_token` | Proteção contra ataques CSRF | Sessão |

### 2.2 Cookies de preferências

Armazenam suas configurações de uso do painel.

| Cookie | Finalidade | Duração |
|---|---|---|
| `ui_theme` | Preferência de tema (claro/escuro) | 1 ano |
| `lang` | Idioma preferido | 1 ano |
| `sidebar_state` | Estado aberto/fechado do menu lateral | 30 dias |

### 2.3 Cookies de análise

`[REVISÃO JURÍDICA OBRIGATÓRIA]` Caso a Church Platform utilize ferramentas de análise (ex: Sentry para erros, métricas de uso), detalhar aqui os cookies gerados e obter consentimento conforme aplicável.

Atualmente: `[a preencher quando ferramentas forem definidas]`

### 2.4 O que não usamos

A Church Platform **não utiliza** cookies de publicidade, rastreamento de terceiros para fins comerciais ou cookies de redes sociais no painel administrativo.

---

## 3. Como gerenciar cookies

Os cookies estritamente necessários não podem ser desativados sem comprometer o funcionamento do painel. Para os demais, você pode:

- Configurar seu navegador para bloquear ou excluir cookies
- Usar o painel de preferências do site `[quando implementado]`

Consulte as instruções do seu navegador:
- [Chrome](https://support.google.com/chrome/answer/95647)
- [Firefox](https://support.mozilla.org/pt-BR/kb/protecao-aprimorada-contra-rastreamento)
- [Safari](https://support.apple.com/pt-br/guide/safari/sfri11471/mac)

---

## 4. App mobile

O aplicativo mobile não utiliza cookies. A autenticação é gerenciada por tokens armazenados de forma segura no dispositivo (Secure Storage do Expo).

---

---

# Documento 5 — Texto de Consentimento LGPD
## Formulário de Cadastro Rápido de Visitante

---

### 5.1 Versão completa (para exibição no formulário)

---

**Seus dados estão seguros com a gente.**

Ao preencher este formulário, você autoriza a **[Nome da Igreja]** a armazenar e utilizar seus dados (nome, telefone e e-mail) para:

- Entrar em contato para acolhimento e acompanhamento pastoral
- Enviar informações sobre eventos, cultos e atividades da Igreja
- Registrar sua presença em atividades da Igreja

Seus dados **não serão vendidos ou compartilhados** com terceiros para fins comerciais.

Você pode revogar este consentimento a qualquer momento entrando em contato com a secretaria da Igreja.

☐ **Concordo em receber comunicações da [Nome da Igreja]** *(obrigatório para concluir o cadastro)*

---

*Este formulário é processado pela Church Platform. Para saber mais sobre como seus dados são tratados, consulte a [Política de Privacidade](#).*

---

### 5.2 Versão reduzida (para QR code em culto — tela pequena)

---

Seus dados serão usados pela **[Nome da Igreja]** para acolhimento e comunicação. Não compartilhamos com terceiros.

☐ **Aceito receber comunicações da Igreja** *(obrigatório)*

[Ver política de privacidade completa](#)

---

### 5.3 Mensagem de sucesso — cadastro novo (visitante que nunca esteve na base)

---

**Tudo certo, [Nome]! 🎉**

Seu cadastro foi registrado. É muito bom ter você aqui!
Em breve alguém da nossa equipe pode entrar em contato para te receber melhor.

---

### 5.4 Mensagem de sucesso — visitante que já estava na base (deduplicação)

---

**Tudo certo, [Nome]! 😊**

Seu cadastro já está com a gente. Registramos sua presença hoje.
Que bom ter você de volta!

---

### 5.5 Notas técnicas de implementação

**O que deve ser gravado no banco junto ao consentimento:**

| Campo | Valor |
|---|---|
| `consent_given` | `true` |
| `consent_date` | timestamp UTC do momento do envio |
| `consent_ip` | IP do dispositivo usado no preenchimento |
| `consent_device` | User-agent do navegador/dispositivo |
| `consent_version` | Versão do texto de consentimento exibido (ex: `v0.1`) |
| `consent_origin` | Origem do cadastro (culto / pg / evento / outro) |

**Regra de negócio:** o botão de envio deve permanecer desabilitado enquanto o checkbox de consentimento não estiver marcado. O sistema não deve permitir o envio do formulário sem o aceite registrado.

**Consentimento de menores:** se o formulário for usado para cadastro de crianças (ministério infantil), exibir campo adicional "Nome do responsável legal" e adaptar o texto do consentimento para o responsável, não para a criança.

---

---

# Índice de Itens para Revisão Jurídica Obrigatória

Os itens abaixo foram marcados com `[REVISÃO JURÍDICA OBRIGATÓRIA]` ao longo dos documentos e **não devem ser publicados sem validação profissional:**

1. **DPA e base legal para dados sensíveis religiosos** (Doc. 1, item 7.3 e Doc. 3, item 3) — confirmar se consentimento ou legítimo interesse é a base mais adequada para entidades religiosas
2. **Transferência internacional de dados para OneSignal (EUA)** (Doc. 1, item 7.5 e Doc. 3, item 4) — exige mecanismo de adequação nos termos do Art. 33 da LGPD
3. **Obrigatoriedade de DPO (Encarregado de Dados)** (Doc. 3, item 10) — avaliar se o volume de dados sensíveis processados exige nomeação formal
4. **Responsabilidade sobre transações PIX** (Doc. 1, item 5.3) — definir percentual de taxa e responsabilidades com precisão jurídica
5. **Limitação de responsabilidade** (Doc. 1, item 9) — valores e cláusulas de limitação precisam de validação
6. **SLA e uptime** (Doc. 1, item 3.1b) — definir percentuais e consequências de descumprimento
7. **Foro competente** (Doc. 1, item 10.2) — definir cidade
8. **White-label Plano Premium e informação ao usuário final** (Doc. 1, item 6.4) — verificar obrigação regulatória de informar operação técnica por terceiro
9. **Base legal para dados de crianças** (Doc. 3, item 8) — confirmar se responsabilidade integral da Igreja exime a Plataforma ou se há co-responsabilidade
10. **Cookies de análise** (Doc. 4, item 2.3) — detalhar quando ferramentas de analytics forem definidas

---

*Versão 0.1 — Church Platform — maio de 2026*
*⚠️ Documento para revisão interna. Não publicar sem validação jurídica profissional.*

