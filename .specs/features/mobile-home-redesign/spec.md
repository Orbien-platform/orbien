# Redesenho da Home e do menu inferior (mobile) — Specification

**Escopo: Large** (mexe em navegação, duas telas existentes migram de aba para
rota empilhada, tela Home é redesenhada do zero com componente novo de
slider, um CTA depende de campo novo na API, e há um ajuste visual
independente na tela de login).

## Problem Statement

Hoje a aba raiz do app (`(tabs)/index.tsx`) mistura dois papéis: é a "Home"
(primeira coisa que qualquer usuário vê) e é a tela de "Escala" (lista de
próximas escalas do usuário, com ações de confirmar/recusar/check-in) ao
mesmo tempo — decisão registrada em
`.specs/features/home-dashboard-mobile/spec.md` (HOME-01..05, Medium,
verificada). "Celebrações" também é uma aba própria no menu inferior.

O pedido agora é separar os dois papéis: a Home vira uma tela própria,
orientada a navegação rápida (hero de conteúdo, CTAs para Bíblia,
Contribuição, todos os conteúdos, Escala e Celebrações/eventos), e Escala e
Celebrações deixam de ocupar espaço fixo no menu inferior — continuam
existindo como telas, alcançadas a partir da Home. Esta spec supersede o
desenho de HOME-01..05 no que se refere a "escala é o conteúdo principal da
aba raiz"; as regras de HOME-01/02/03 (saudação, "Meus grupos", "Avisos
recentes") são preservadas dentro da nova Home.

## Goals

- [ ] Menu inferior com 4 abas (Home, Grupos, Conteúdo, Perfil), Home como
      primeira aba, sem exceder o máximo de 5 do STYLE-GUIDE.md §7.
- [ ] Nova Home funcional: hero dinâmico com os últimos conteúdos, CTAs para
      Bíblia / Contribuição / todos os conteúdos, e cartões/ícones para
      Escala (com gate de permissão) e Celebrações e eventos — sem perder
      nenhuma funcionalidade hoje coberta por HOME-01..04.
- [ ] Escala e Celebrações continuam com o mesmo comportamento e testIDs de
      hoje, só mudam de lugar na navegação (de aba para rota empilhada).
- [ ] Tela de login sem corte de texto no nome do app, em qualquer largura
      de tela suportada.

## Out of Scope

| Item | Motivo |
| --- | --- |
| Fluxo nativo de pagamento/PIX dentro do app | Não existe endpoint autenticado de doação para membro comum (só `POST /financial/pix/public-donation`, público, e `POST /financial/pix/dynamic`, restrito a tesoureiro/admin Premium). O CTA de Contribuição abre a página pública `apps/web` existente — decisão tomada com o usuário nesta sessão. |
| Nome/e-mail do usuário na saudação da Home | Mesma restrição de HOME-01: o token e `/settings` não carregam nome nem e-mail (`.specs/features/home-dashboard-mobile/spec.md`). Sem rota nova na API, que este pedido não pede. |
| Notificações não lidas em destaque na Home | Nenhum client atual expõe contagem de não lidas (mesma exclusão de HOME-01..05). |
| Adicionar uma 6ª aba / segunda linha de menu | STYLE-GUIDE.md §7 fixa o máximo em 5; a mudança já libera 1 slot (5 → 4) e a recomendação (ver Assumptions) é não preenchê-lo sem necessidade concreta. |
| Pedidos de oração, "Mais funcionalidades" como CTA na Home | Avaliado (ver seção "Outras funcionalidades avaliadas para a Home") e descartado nesta rodada — não há tela mobile de pedidos de oração hoje; entraria como funcionalidade de produto nova, fora do escopo de reorganização de front. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| CTA de Contribuição | Abre `${WEB_URL}/doar/{tenant_slug}` em browser in-app (`expo-web-browser`), reaproveitando a página pública PIX que já existe em `apps/web`. Requer expor `tenant_slug` em `GET /settings` (novo campo, sem lógica de negócio nova) e uma env nova `ORBIEN_WEB_URL`/`extra.webUrl` no app mobile (mesmo padrão de `apiUrl`). | Decisão tomada com o usuário nesta sessão (pergunta feita via AskUserQuestion) — opção recomendada entre as três oferecidas. | y |
| Corte do "n" de "Orbien" no login | Corte lateral (borda direita) do texto `appName` (`typography.display`, `Text` em `login.tsx`). Correção: garantir que o texto nunca fique mais apertado que seu conteúdo — remover qualquer possibilidade de o box medido ficar mais estreito que o texto renderizado (padding de respiro + `flexShrink`/`numberOfLines` explícitos na `Text`), e validar em telas estreitas (320–375px) e com escala de fonte do sistema aumentada. | Confirmado com o usuário via pergunta (corte lateral direita). Causa raiz exata não é 100% certa sem reproduzir num device — o teste de aceite cobre o efeito (texto nunca cortado), não uma causa específica. | y |
| 5º slot do menu inferior (hoje sobra 1, de 5 para 4 abas) | Não preencher agora — deixar vago. | Nenhuma outra funcionalidade do app hoje justifica virar aba fixa (ver seção de avaliação abaixo); preencher por preencher viola "não adicionar funcionalidade além do necessário". | n — proposto, não perguntado explicitamente; se o usuário quiser preencher, é decisão dele em cima desta spec. |
| Onde fica a lista de "Próximas escalas" (ações confirmar/recusar/check-in) depois da mudança | Nova rota empilhada `src/app/escala.tsx` (fora de `(tabs)`, como `biblia/` e `indisponibilidade.tsx` hoje), registrada no `Stack.Protected` do layout raiz. Mesmo componente/lógica de hoje, só o container muda (de `(tabs)/index.tsx` para rota de detalhe com header). | É a forma mínima de preservar HOME-04 (mesmos testIDs, mesmo comportamento) fora do menu inferior. | n — inferido da spec anterior; não é ambíguo o suficiente para valer uma pergunta separada (segue o mesmo padrão já usado por `indisponibilidade` e `biblia`). |
| Onde fica a lista de Celebrações (hoje aba `celebracoes.tsx`) | Nova rota empilhada `src/app/celebracoes.tsx`, mesmo padrão acima. Mantém a lógica de fonte de dados por papel (`getMyAssignments` vs `listUpcomingInstances`) exatamente como está. | Mesmo raciocínio da linha acima. | n |

**Open questions:** nenhuma — todas resolvidas ou registradas acima.

---

## User Stories

### P1: Menu inferior com Home em primeiro e sem Escala/Celebrações ⭐ MVP

**User Story**: Como usuário do app, quero abrir o app e ver a Home como
primeira tela, com um menu inferior enxuto, para não competir por espaço com
telas que agora vivem dentro da própria Home.

**Why P1**: É a mudança estrutural que todo o resto depende — sem ela não
há "Home" para receber os CTAs.

**Acceptance Criteria**:

1. WHEN o app abre autenticado THEN o menu inferior SHALL mostrar, nesta
   ordem, Home (ícone/rota `index`), Grupos, Conteúdo, Perfil — 4 itens.
2. WHEN o usuário olha o menu inferior THEN não SHALL existir item de
   "Escala" nem de "Celebrações".
3. WHEN o usuário abre a rota `/escala` (novo destino do CTA de Escala da
   Home) THEN o app SHALL mostrar exatamente a lista de "Próximas escalas"
   de hoje (mesmos testIDs: `escala-list`, `escala-error`, `escala-empty`,
   `assignment-*`, `confirm-*`, `decline-*`, `check-in-*`,
   `indisponibilidade-link`, `escala-action-error`) com header de tela
   (título "Escala", botão voltar).
4. WHEN o usuário abre a rota `/celebracoes` (novo destino do card de
   Celebrações da Home) THEN o app SHALL mostrar exatamente a lista de
   celebrações de hoje (mesma lógica de fonte por papel, mesmo componente),
   com header de tela (título "Celebrações").

**Independent Test**: navegar pelo menu inferior e contar os itens; abrir
`/escala` e `/celebracoes` a partir da Home e comparar comportamento com o
que existe hoje em `(tabs)/index.tsx` e `(tabs)/celebracoes.tsx`.

---

### P1: Nova Home com hero dinâmico e CTAs ⭐ MVP

**User Story**: Como usuário do app, quero uma Home com destaque visual dos
conteúdos mais recentes e atalhos rápidos para as ações mais comuns (Bíblia,
Contribuição, ver todos os conteúdos), para não precisar navegar por abas
para chegar no que uso com mais frequência.

**Why P1**: É o pedido central desta mudança.

**Acceptance Criteria**:

1. WHEN a Home carrega THEN SHALL mostrar, no topo, um hero com slider
   horizontal dos últimos conteúdos publicados (mesma fonte de
   `getPosts(1, N)` do client de conteúdo, `N` = 5), cada item navegando
   para `/post/[id]` ao ser tocado.
2. WHEN não há conteúdo publicado (lista vazia) ou a chamada falha THEN o
   hero SHALL ser omitido silenciosamente (mesma regra de degradação de
   HOME-02/03) — a Home não SHALL travar nem mostrar erro bloqueante por
   causa do hero.
3. WHEN a Home carrega THEN SHALL mostrar um CTA para Bíblia (navega para
   `/biblia`), um CTA para Contribuição (abre
   `${WEB_URL}/doar/{tenant_slug}` em browser in-app) e um CTA para "Ver
   todos os conteúdos" (navega para a aba `/conteudo`).
4. WHEN o usuário tem a área `volunteers` (mesma checagem de
   `areas.includes("volunteers")` usada hoje em `(tabs)/_layout.tsx`) THEN a
   Home SHALL mostrar um ícone/cartão de atalho para Escala (navega para
   `/escala`); WHEN não tem THEN esse atalho SHALL ficar ausente (mesma
   política fail-open de UX: `areas === null` também mostra, igual à tab bar
   hoje).
5. WHEN a Home carrega THEN SHALL mostrar um ícone/cartão de informação
   sobre celebrações e eventos (navega para `/celebracoes`), sem gate de
   papel (mesma regra hoje: a lista em `/celebracoes` já resolve a fonte de
   dados certa por papel internamente).
6. WHEN a Home carrega THEN SHALL preservar a saudação por horário
   (HOME-01), o destaque "Meus grupos" (HOME-02) e o destaque "Avisos
   recentes" (HOME-03), com as mesmas regras de degradação silenciosa.
7. WHEN o CTA de Contribuição é tocado e `tenant_slug` ainda não foi
   resolvido (ex.: `GET /settings` falhou ou ainda está carregando) THEN o
   CTA SHALL ficar desabilitado (não navega para lugar nenhum, sem crash),
   em vez de abrir uma URL inválida.

**Independent Test**: abrir a Home com mocks de conteúdo/grupos/posts
populados e vazios; tocar cada CTA e conferir o destino; alternar
`areas` para com/sem `volunteers` e conferir a presença do atalho de
Escala.

---

### P2: Ajuste de layout na tela de login

**User Story**: Como usuário abrindo o app pela primeira vez, quero ver o
nome do app completo e legível na tela de login, sem letras cortadas.

**Why P2**: É um bug visual independente da reorganização de Home/menu,
mas o usuário pediu para entrar nesta mesma rodada.

**Acceptance Criteria**:

1. WHEN a tela de login renderiza o nome do app (`appName`,
   `typography.display`) THEN nenhum caractere SHALL aparecer cortado, em
   larguras de tela de 320px a 430px.
2. WHEN o usuário aumenta a escala de fonte do sistema (até 130%) THEN o
   nome do app SHALL continuar sem corte — pode quebrar linha, mas não pode
   cortar caractere.

**Independent Test**: validação visual (screenshot) em pelo menos duas
larguras (320px e a largura de referência do design) e com escala de fonte
aumentada — não é algo que um teste de snapshot Jest cubra de forma
confiável (RN não renderiza pixels no ambiente de teste), então a
verificação final desta história é UAT visual, não suíte automatizada.

---

## Outras funcionalidades avaliadas para a Home (e descartadas nesta rodada)

Levantamento pedido explicitamente ("avalie outras funcionalidades"). Nenhum
destes items vira requisito nesta spec — ficam registrados para não perder a
avaliação:

- **Pedidos de oração** — existe RLS/tabela `prayer_requests` na API, mas
  nenhuma tela mobile consome isso hoje. Seria funcionalidade de produto
  nova (tela + client), não cabe em "reorganização de front".
- **Contagem de notificações não lidas no ícone/CTA** — nenhum client atual
  expõe contagem (mesma exclusão já feita em HOME-01..05).
- **Atalho para Perfil/edição de indisponibilidade em destaque** — já existe
  como card "Minha indisponibilidade" no topo da Home atual; mantido dentro
  desta spec como parte do que HOME-05 preservava, não é novidade.
- **Preencher o 5º slot do menu inferior** — avaliado e recomendado não
  preencher agora (ver Assumptions); nenhuma tela hoje pede virar aba fixa
  no lugar de um CTA na Home.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| MHR-01 | P1: Menu inferior | Design | Pending |
| MHR-02 | P1: Menu inferior — remoção Escala/Celebrações do tab bar | Design | Pending |
| MHR-03 | P1: Menu inferior — rota `/escala` preserva comportamento | Design | Pending |
| MHR-04 | P1: Menu inferior — rota `/celebracoes` preserva comportamento | Design | Pending |
| MHR-05 | P1: Home — hero dinâmico de conteúdos | Design | Pending |
| MHR-06 | P1: Home — degradação silenciosa do hero | Design | Pending |
| MHR-07 | P1: Home — CTAs Bíblia/Contribuição/Todos os conteúdos | Design | Pending |
| MHR-08 | P1: Home — atalho Escala com gate de permissão | Design | Pending |
| MHR-09 | P1: Home — cartão Celebrações e eventos | Design | Pending |
| MHR-10 | P1: Home — preserva saudação/Meus grupos/Avisos recentes | Design | Pending |
| MHR-11 | P1: Home — CTA Contribuição desabilitado sem tenant_slug | Design | Pending |
| MHR-12 | P2: Login — sem corte de texto no appName | Design | Pending |

**Coverage:** 12 total, 0 mapeados a tasks ainda, 12 não mapeados ⚠️ (normal
nesta fase — mapeamento acontece em Tasks).

---

## Success Criteria

- [ ] Menu inferior com 4 itens (Home, Grupos, Conteúdo, Perfil), Home
      primeiro, sem Escala nem Celebrações.
- [ ] Home mostra hero dinâmico + 3 CTAs (Bíblia, Contribuição, Todos os
      conteúdos) + atalho de Escala (gated) + cartão de Celebrações, sem
      quebrar nenhum critério de aceite herdado de HOME-01..04.
- [ ] `/escala` e `/celebracoes` funcionam de forma indistinguível do
      comportamento atual das antigas abas, mesmos testIDs.
- [ ] Suíte de testes de `(tabs)/index.test.tsx` e `(tabs)/celebracoes.test.tsx`
      migra para os novos arquivos sem perder cobertura nem asserção.
- [ ] Tela de login sem corte de texto, verificado visualmente.
