# App Mobile (apps/mobile) — Specification

## Problem Statement

Orbien hoje só existe como produto web (`apps/web`). O plano de produto original
(ADR-004/ADR-005) sempre previu um app nativo para membro e liderança —
principalmente por push notification nativo, câmera para QR/check-in e uso em
campo (escala, presença) onde abrir o navegador é fricção. O `docs/ROADMAP.md`
listava isso como decisão de produto em aberto; foi confirmada agora. O backend
(`apps/api`) já expõe os módulos que o mobile precisa consumir, e a integração
com OneSignal para push já existe do lado do servidor — o app mobile é a peça
que falta para essa infraestrutura ter uso.

O produto final terá **duas variantes de distribuição** (ADR-005): uma versão
**genérica multi-tenant** (Starter) — um único app publicado nas lojas, tema
aplicado em runtime por tenant — e, depois, uma versão **white-label por
tenant** (Premium) — build próprio por igreja, publicado na loja com nome/
ícone/bundle id próprios da igreja. Este v1 implementa só a Starter, mas a
arquitetura (config de tema/branding, identidade do app, integração OneSignal)
é desenhada agora para que a Premium entre depois como *mesmo código-fonte +
profile de build diferente*, sem reescrever o que a Starter já usa.

## Goals

- [ ] Membro e liderança autenticam e usam o app em iOS e Android sem passar
      pelo navegador, para os 4 módulos do escopo v1.
- [ ] Push notifications nativas chegam ao dispositivo (posts publicados,
      escala/OC, lembretes de PG) usando a infraestrutura OneSignal que o
      backend já tem.
- [ ] Tema por tenant (cores, logo) é aplicado dinamicamente no app, sem exigir
      build separado por igreja — modelo Starter do ADR-005.
- [ ] `apps/mobile` entra no monorepo como workspace novo, com dev loop e
      pipeline de deploy (EAS) documentados, sem tocar nos outros três apps.
- [ ] Identidade do app (nome, bundle id/package, ícone, app id do OneSignal)
      e tema (cor, logo) não ficam hardcoded no código-fonte compartilhado —
      vêm de config resolvida em build/runtime, para a variante white-label
      (Premium) poder existir depois como novo profile de build, sem fork do
      código.

## Out of Scope

| Feature | Reason |
|---|---|
| Módulo Financeiro no mobile | Dado sensível, fluxo de aprovação/lançamento é desktop-first; nenhum ADR pede mobile aqui. Fica só no `apps/web`. |
| Build dedicado por tenant via EAS (plano Premium) — **implementação** | ADR-005 já separa os dois modelos; o Premium depende do Starter existir primeiro e tem pipeline próprio (release por tenant, submissão de loja por igreja). Vira feature separada. A **arquitetura** do v1 (config dinâmica de identidade/tema, sem hardcode) é desenhada agora para não exigir retrabalho quando o Premium entrar — ver Assumptions. |
| Modo offline / sincronização local | Nenhum requisito hoje pede uso sem rede; adicionar cache offline muda a arquitetura de dados inteira. Fica para quando houver dor real. |
| OTA updates (Expo Updates) configurado para produção | Faz parte do ADR-004, mas é infraestrutura de release, não funcionalidade — entra junto do pipeline de deploy, não do v1 funcional. |
| Autoatendimento de suporte dentro do mobile (sessão de suporte cross-app) | O modelo de sessão de suporte (`apps/admin` → `apps/web`) é web-to-web por fragmento de URL; estender para mobile é decisão própria, fora deste escopo. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
|---|---|---|---|
| Armazenamento de token no mobile | `expo-secure-store` (Keychain/Keystore), nunca `AsyncStorage` puro | Cookie `HttpOnly` não existe em app nativo; SecureStore é o equivalente de segurança para RN. Consistente com o motivo que já levou o web a sair de `localStorage`. | n — assunção técnica, sinalizar ao usuário |
| Transporte de auth | `Authorization: Bearer <token>` direto para `apps/api`, sem proxy | O app não tem origem de navegador para exigir cookie; a API já aceita Bearer (é o que o `/api-proxy` do web injeta hoje). Mobile fala direto com a API. | n |
| Renovação de sessão | App implementa sua própria fila de refresh (mesmo princípio do interceptor do `apps/web`: uma rotação por vez, família revogada em reuso) | A API já reforça isso no backend (revogação de família); o cliente só precisa não rodar rotações concorrentes. | n |
| White-label v1 | Tema dinâmico (fetch de `branding_configs` no login, aplicado em runtime) — sem build por tenant | Escopo explicitamente cortou o Premium (build EAS por tenant) para depois. | y — decorre do Out of Scope acordado |
| Identificação no OneSignal | `external_id` do OneSignal = `id` da `Person`/`user_account` autenticado, setado no login | Backend já filtra segmentos por critérios de pessoa (idade, ministério etc.) — precisa de uma identidade estável para casar dispositivo↔pessoa. Não existe tabela de device token a criar: o OneSignal SDK gerencia isso no cliente. | n |
| Módulo Financeiro fora do mobile | Confirmado no Out of Scope | Resposta do usuário na etapa de discovery (4 dos 5 módulos, sem Financeiro). | y |
| Plataformas alvo | iOS + Android, Expo managed workflow | ADR-004 já decide Expo; managed workflow é o padrão Expo para não gerenciar código nativo à mão, coerente com "zero configuração de push no MVP" do próprio ADR. | n |
| Deploy/CI do mobile | EAS Build (dev/preview/production), fora do Vercel/Render; não entra no `turbo run build` dos fronts | Nenhum ADR sugere hospedar bundle mobile nos mesmos pipelines; EAS é o serviço que ADR-004 já nomeia. | n |
| Código-fonte para Starter e Premium | **Um único codebase** (`apps/mobile`), variantes diferem só por *build profile* do EAS (`eas.json`) + `app.config.js` dinâmico — nunca dois apps/repos separados | Fork de código para cada variante branch-a-branch, além do custo de manutenção duplicada, diverge com o tempo (fix na Starter não chega na Premium). Mesmo código também é o único jeito de o Premium herdar automaticamente tudo que o v1 entregar. | n — decisão técnica nova desta rodada |
| Identidade do app (nome/ícone/bundle id/scheme) | Resolvida em `app.config.js` (função, não `app.json` estático) a partir de variáveis de ambiente/`eas.json` `extra` por profile; no profile único do v1 (`generic`) resolve sempre para "Orbien" | `app.json` estático não permite valores por profile; `app.config.js` dinâmico é o padrão Expo para isso e é o único jeito de o Premium (profile por tenant, cada um com seu bundle id/ícone) existir sem tocar no código do app depois. | n |
| App id do OneSignal | Vem de config (env/`app.config.js`), não hardcoded no código; v1 usa um único app id (multi-tenant, segmentado por `external_id`/tags) | Deixar o app id fixo no código obrigaria editar arquivo-fonte para cada app id do Premium (um por igreja, plano futuro do ADR-005); como config, o profile decide, o código não muda. | n |
| Tema/branding no runtime vs. no build | Mantido como está no v1 (fetch de `branding_configs` em runtime, ver linha "White-label v1" acima) — variantes de build (Premium) trocam identidade/ícone/nome, não o mecanismo de tema em runtime, que continua igual nas duas variantes | O tema por tenant já é dinâmico por design (não hardcoded); o que muda no Premium é a *casca* do app (nome/ícone na loja), não como a cor/logo chegam à tela — não há retrabalho aqui, só reafirmando que o mecanismo já é compatível. | n |

**Open questions:** nenhuma sem resposta — os itens acima marcados `n` são
decisões técnicas de menor risco (não têm ADR explícito para o detalhe), fica
sinalizado ao usuário no resumo da fase; nada foi deixado sem decisão registrada.

---

## User Stories

### P1: Autenticação e sessão ⭐ MVP

**User Story**: Como membro ou liderança de uma igreja-tenant, quero entrar no
app mobile com o mesmo login que uso no `apps/web`, para acessar meus dados sem
outro cadastro.

**Why P1**: Toda outra história depende de sessão autenticada.

**Acceptance Criteria**:

1. WHEN o usuário informa `tenant_slug` + e-mail + senha corretos THEN o app
   SHALL autenticar contra `POST /auth/login`, guardar access e refresh token
   em `expo-secure-store` e navegar para a tela inicial do módulo padrão.
2. WHEN as credenciais estão erradas THEN o app SHALL mostrar mensagem de erro
   genérica, sem distinguir "senha errada" de "tenant não encontrado" nos casos
   em que a própria API já responde de forma indistinguível (ver `CLAUDE.md`
   raiz sobre a rota de login de plataforma — mesmo princípio se aplica aqui:
   não vazar por mensagem o que a API decidiu não vazar).
3. WHEN o access token expira em uma chamada autenticada THEN o app SHALL
   disparar exatamente uma renovação (fila serializada, não uma por request
   simultânea) e reenviar a chamada original após sucesso.
4. WHEN a renovação falha (refresh revogado/expirado) THEN o app SHALL limpar
   o SecureStore e navegar para a tela de login.
5. WHEN o usuário pede "sair" THEN o app SHALL chamar o endpoint de logout (se
   existir) e apagar os tokens do SecureStore antes de navegar para login.

**Independent Test**: login com conta seed do ambiente de dev, forçar expiração
do access token (TTL curto em dev) e confirmar que a chamada seguinte renova
sozinha sem deslogar o usuário.

---

### P1: Tema por tenant (white-label dinâmico) ⭐ MVP

**User Story**: Como usuário de uma igreja-tenant, quero que o app mostre a cor
e o logo da minha igreja, para reconhecer que é "o app da minha igreja" e não
um produto genérico.

**Why P1**: É a peça do ADR-005 que diferencia o produto e não depende de
nenhum outro módulo — pode ser demonstrada isoladamente logo após o login.

**Acceptance Criteria**:

1. WHEN o login é concluído THEN o app SHALL buscar `branding_configs` do
   tenant e aplicar cor primária + logo no shell de navegação.
2. WHEN o tenant não tem branding customizado THEN o app SHALL cair no tema
   padrão Orbien, sem erro visível ao usuário.
3. WHEN o app é reaberto com sessão válida (sem novo login) THEN o app SHALL
   reaplicar o tema cacheado localmente antes de qualquer nova chamada de rede
   completar, para não mostrar um "flash" do tema padrão.

**Independent Test**: logar em dois tenants seed diferentes (com branding
distinto) e confirmar visualmente que cor/logo mudam.

---

### P1: Membros e Voluntários ⭐ MVP

**User Story**: Como voluntário, quero ver minha escala e confirmar
disponibilidade/check-in pelo celular, para não depender de abrir o site
durante o culto ou reunião.

**Why P1**: É o módulo mais citado como motivador do app nativo (uso em campo).

**Acceptance Criteria**:

1. WHEN o usuário abre a aba "Escala" THEN o app SHALL listar as próximas
   escalas do usuário logado, consumindo os mesmos endpoints que o `apps/web`
   usa hoje para escala/voluntários.
2. WHEN o usuário tem um slot pendente de confirmação THEN o app SHALL permitir
   confirmar ou recusar, refletindo a mesma regra de negócio que a API já
   aplica (trocas, `SwapRequest`) — o app não duplica validação, só chama a
   rota.
3. WHEN o usuário faz check-in de um evento THEN o app SHALL enviar o check-in
   e mostrar confirmação visual imediata.
4. WHEN o usuário edita sua indisponibilidade THEN o app SHALL refletir a
   mudança na tela sem precisar de reload manual.

**Independent Test**: conta voluntário seed com um slot futuro — confirmar,
depois recusar, e ver a lista atualizar.

---

### P1: Conteúdos e Notificações ⭐ MVP

**User Story**: Como membro, quero ver os posts da minha igreja e receber
push quando um novo post for publicado, para não perder comunicados.

**Why P1**: É o módulo que justifica tecnicamente o app nativo em vez de PWA —
push real depende de app instalado.

**Acceptance Criteria**:

1. WHEN o app inicializa após login THEN o app SHALL registrar o dispositivo
   no OneSignal SDK com `external_id` = id da pessoa autenticada.
2. WHEN o usuário abre a aba "Conteúdo" THEN o app SHALL listar os posts
   publicados da congregação do usuário — **sem** filtrar por segmento de
   audiência, replicando exatamente o que `apps/web` já faz contra a mesma
   rota.

   > A redação original desta AC dizia "visíveis para os segmentos de
   > audiência do usuário", o que a implementação nunca fez — e nem devia.
   > `AudienceSegment`/`PostSegment` regem só *push targeting* (MOB-07); a
   > query de listagem não cruza segmento nenhum. A decisão de manter assim
   > foi tomada e confirmada com o usuário na rodada de Design de MOB-06
   > (`design.md`, "Achado importante — segmentação de audiência não filtra a
   > listagem"): filtrar o feed por segmento seria mudança de produto na
   > mesma rota que o web consome, fora do escopo desta spec. Texto corrigido
   > aqui para quem lê o `spec.md` sozinho não presumir um filtro que não
   > existe.
3. WHEN um post novo é publicado e o dispositivo está registrado no segmento
   correspondente THEN o usuário SHALL receber uma push notification (fluxo
   ponta a ponta: backend já dispara via OneSignal, o app só precisa estar
   registrado e tratar o toque na notificação).
4. WHEN o usuário toca numa push notification THEN o app SHALL abrir
   diretamente o post relacionado, não a lista.

**Independent Test**: publicar um post no `apps/admin`/`apps/web` (ou via API)
para o segmento do usuário de teste e confirmar que a push chega no device
físico ou simulador com push habilitado.

---

### P2: Celebrações e Ordem de Culto

**User Story**: Como membro de ministério (louvor, técnica), quero ver a escala
de celebração e a Ordem de Culto (OC) do próximo evento pelo celular.

**Why P2**: Importante, mas é leitura sobre dado que já existe no módulo de
Membros/Voluntários (mesma infraestrutura de escala) — pode vir depois do P1
sem bloquear o valor central do app.

**Acceptance Criteria**:

1. WHEN o usuário abre a aba "Celebrações" THEN o app SHALL listar as próximas
   `CelebrationInstance` que o usuário pode ver, segundo as mesmas regras de
   papel que a API já aplica.
2. WHEN o usuário abre uma instância THEN o app SHALL mostrar a Ordem de Culto
   (`ServiceOrder`/`ServiceOrderItem`) e, se aplicável, o `Setlist`, em modo
   leitura.
3. WHEN o usuário está escalado nessa celebração THEN a tela SHALL destacar sua
   função/horário.

**Independent Test**: conta de ministério de louvor com uma celebração futura —
abrir e conferir OC e setlist.

---

### P2: Pequenos Grupos

**User Story**: Como líder ou membro de PG, quero ver encontros, marcar
presença e acessar materiais do grupo pelo celular.

**Why P2**: Uso relevante mas menos frequente que escala/conteúdo (semanal, não
diário) — pode vir depois do P1 sem perder o valor central do lançamento.

**Acceptance Criteria**:

1. WHEN o usuário abre a aba "Grupos" THEN o app SHALL listar os grupos em que
   participa (líder ou membro).
2. WHEN o líder registra presença de um encontro THEN o app SHALL enviar a
   lista de presença para a API e confirmar visualmente.
3. WHEN há material agendado para o grupo THEN o app SHALL listar e permitir
   abrir/baixar o material (mesmo endpoint de `group_meeting_materials` do
   `apps/web`).

**Independent Test**: conta líder de PG seed — abrir grupo, registrar presença
de um encontro, abrir um material.

---

### P3: Preferências de notificação por usuário

**User Story**: Como usuário, quero escolher quais tipos de push eu recebo,
para não ser inundado de notificações que não me interessam.

**Why P3**: Melhora experiência, mas o v1 pode funcionar só com os segmentos
que o backend já define — não bloqueia lançamento.

**Acceptance Criteria**: ver `.specs/features/preferencias-notificacao-mobile/spec.md`.

> A redação original desta história dizia "conteúdo, escala, PG" e "via tag
> OneSignal local, sem precisar de mudança no backend". Nenhum dos dois é
> verdade hoje: só `ContentPost` dispara push (não há push de escala nem de
> PG), e a rodada de Design de MOB-10 decidiu persistir a preferência no
> servidor (sincroniza entre aparelhos), não só no device. Texto corrigido
> aqui para quem lê esta spec sozinho não presumir um escopo ou mecanismo que
> a feature dedicada não implementa — mesmo princípio da nota já registrada
> em "P1: Conteúdos e Notificações" acima.

---

### Infra: Identidade de app configurável (base para variante white-label)

**User Story**: Como time de plataforma, quero que nome, ícone, bundle id/
package e app id do OneSignal do app venham de configuração por build profile
— não do código-fonte —, para que a variante white-label (Premium) possa ser
adicionada depois como um novo profile de build, sem editar o código
compartilhado que a Starter usa.

**Why (infra, sem prioridade P):** não é uma tela nem um fluxo de usuário; é a
condição para o Success Criteria "sem retrabalho de arquitetura" do Premium.
Vale para o v1 mesmo com um profile só (`generic`).

**Acceptance Criteria**:

1. WHEN o app é buildado (dev, preview via EAS, ou produção via EAS) THEN o
   nome exibido, o ícone, o bundle identifier (iOS) / applicationId (Android)
   e o scheme de deep link SHALL vir de `app.config.js` (função dinâmica),
   nunca de um `app.json` estático com valores fixos.
2. WHEN nenhuma variável de ambiente/`eas.json` `extra` de tenant é informada
   (caso do v1, profile único) THEN `app.config.js` SHALL resolver para a
   identidade genérica Orbien (nome, ícone, bundle id, app id do OneSignal
   padrão) sem exigir nenhuma configuração adicional do desenvolvedor.
3. WHEN um novo profile de build é adicionado a `eas.json` (ex.: um profile
   `whitelabel-<tenant>` no futuro) THEN nenhuma alteração em arquivo de
   código-fonte compartilhado (fora de `app.config.js`/`eas.json`) SHALL ser
   necessária para esse profile produzir um app com identidade própria —
   este AC não implementa o profile Premium, só garante que `app.config.js`
   já responde por ele.
4. WHEN o código do app (telas, componentes, chamadas à API) referencia nome
   do app, ícone ou app id do OneSignal THEN SHALL fazê-lo sempre através da
   config resolvida em runtime (ex.: `Constants.expoConfig.extra`), nunca por
   literal de string hardcoded.

**Independent Test**: rodar `npx expo config` (ou `eas build:inspect`) com e
sem as variáveis de ambiente de exemplo setadas e confirmar que nome/ícone/
bundle id mudam só por config, sem tocar em código.

---

## Edge Cases

- WHEN o dispositivo está sem internet ao abrir o app THEN o app SHALL mostrar
  estado de erro de rede claro (não uma tela vazia interpretável como "sem
  dado"), consistente com a decisão já tomada no `apps/web` para 403 vs. lista
  vazia — mesmo princípio, causa diferente (rede, não permissão).
- WHEN o usuário não tem papel suficiente para um módulo do escopo v1 (ex.:
  `member` sem vínculo de voluntário) THEN o app SHALL ocultar ou desabilitar
  a aba correspondente, e nunca mostrar lista vazia como se fosse "nada
  cadastrado" — mesmo princípio da pendência nº 10 do `docs/PENDENCIAS.md`.
- WHEN a conta é desativada no meio de uma sessão THEN a próxima chamada
  autenticada SHALL receber 401 do backend e o app SHALL tratar como sessão
  encerrada (mesmo comportamento que o `JwtStrategy.validate` já garante no
  servidor).
- WHEN o app recebe uma push notification para um post que foi despublicado
  entre o disparo e o toque do usuário THEN o app SHALL mostrar estado de "não
  encontrado" ao abrir, não travar.
- WHEN duas abas/telas disparam refresh de token ao mesmo tempo (ex.: duas
  chamadas simultâneas expiram juntas) THEN o app SHALL serializar em uma única
  renovação — evita o mesmo problema de reuso de refresh token que já existe
  documentado para o `apps/web`.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| MOB-01 | P1: Autenticação e sessão | Design | ✅ Verified |
| MOB-02 | P1: Autenticação e sessão (refresh serializado) | Design | ✅ Verified |
| MOB-03 | P1: Tema por tenant | Design | ✅ Verified |
| MOB-04 | P1: Membros e Voluntários — escala (listar, confirmar/recusar, check-in) | Design | ✅ Verified |
| MOB-05 | P1: Membros e Voluntários — indisponibilidade | Design | ✅ Verified |
| MOB-06 | P1: Conteúdos — feed | Design | ✅ Verified |
| MOB-07 | P1: Conteúdos — push (registro OneSignal + deep link) | Design | ✅ Verified |
| MOB-08 | P2: Celebrações e OC | Design | ✅ Verified — `.specs/features/celebracoes-oc-mobile/` |
| MOB-09 | P2: Pequenos Grupos | Design | ✅ Verified — `.specs/features/pequenos-grupos-mobile/` |
| MOB-10 | P3: Preferências de notificação | Execute | ✅ Verified — `.specs/features/preferencias-notificacao-mobile/` |
| MOB-11 | Infra: workspace `apps/mobile` + dev loop + EAS deploy | Design | ✅ Verified |
| MOB-12 | Infra: `app.config.js` dinâmico + `eas.json` multi-profile (base p/ Premium futuro) | Design | ✅ Verified |

**ID format:** `MOB-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 12 total, **12 verificadas** (MOB-01 a MOB-12). MOB-10 (P3)
verificado em 2026-09-11 — feature própria
`.specs/features/preferencias-notificacao-mobile/`, veredito PASS em
`validation.md` (T1-T14, spec-anchored check + discrimination sensor).

**Nota (Fases 1-5 do Execute) — cumprida.** As duas notas que viviam aqui
instruíam a não marcar "Verified" enquanto o Verifier não tivesse rodado no
fechamento da feature: MOB-11/MOB-12 depois das Fases 1/2, MOB-01/MOB-02
depois das 3/4. O Verifier rodou, e os vereditos estão em `validation.md`
(Rodada 1). A condição das notas não vale mais e a tabela acima reflete o
resultado — por isso elas saíram, em vez de seguirem como instrução vencida.

**Rodadas posteriores:** MOB-04 e MOB-05 (Rodada 2), MOB-06 (Rodada 3) e
MOB-07 (Rodada 4) foram verificados em rodadas próprias, cada uma com seu
veredito em `validation.md` e o bloco correspondente fechado em `tasks.md`.
MOB-08 e MOB-09 têm feature própria
(`.specs/features/celebracoes-oc-mobile/`, `.specs/features/pequenos-grupos-mobile/`).

---

## Success Criteria

- [ ] Usuário autentica no app mobile com a mesma conta do `apps/web`, sem
      cadastro paralelo.
- [ ] Push notification de um post novo chega no dispositivo em menos de 1
      minuto do disparo, ponta a ponta.
- [ ] Tema (cor + logo) do tenant aparece corretamente para pelo menos dois
      tenants seed distintos.
- [ ] `apps/mobile` builda localmente (`npx expo start`) e via EAS (build de
      preview) sem editar nenhum arquivo dos outros três apps.
- [ ] Os 4 módulos do escopo (Membros/Voluntários, Conteúdos, Celebrações/OC,
      Pequenos Grupos) têm pelo menos a tela de leitura funcionando contra a
      API real de desenvolvimento.
- [ ] Nenhum arquivo de código-fonte compartilhado (fora de `app.config.js`/
      `eas.json`) precisa ser editado para produzir um build com identidade
      diferente — validado simulando um segundo profile de build no v1.
