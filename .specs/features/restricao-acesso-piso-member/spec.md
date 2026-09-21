# Restrição de acesso do piso (`member`) — web e mobile

## Problem Statement

Desde que a importação de pessoas passou a criar `UserAccount` + `RoleAssignment('member')`
automaticamente para toda linha com e-mail válido (feature já entregue, branch
`claude/eloquent-keller-9jgc1n`), qualquer visitante/frequentador/membro importado ganha
senha e consegue logar tanto em `web.useorbien.com` quanto no app mobile. Dados sensíveis
(financeiro, pessoas, etc.) já estão protegidos por `@Roles` — isso não muda. Mas dois
problemas de produto ficaram expostos:

1. **Web inteiro não faz sentido para o piso.** `web.useorbien.com` é ferramenta de gestão
   (liderança, financeiro, configuração de PG). Hoje nada impede alguém com só o papel
   `member` de logar lá — a tela abre, mesmo que a maior parte tome 403 depois.
2. **Mobile mostra a aba Escala para quem não serve em nenhuma área.** A aba e a tela de
   Indisponibilidade aparecem para todo mundo autenticado, sem checar se a pessoa tem
   alguma atribuição de voluntariado.

## Goals

- [ ] Ninguém cujo único papel seja `member` consegue estabelecer sessão em
      `web.useorbien.com` — recusado no login, com mensagem clara.
- [ ] A aba "Escala" e a tela "Indisponibilidade" do app mobile só aparecem para quem tem a
      área `volunteers` (já definida em `product-areas.ts`), sem duplicar a lista de papéis
      no front.
- [ ] Zero regressão nos outros 9 papéis (`tenant_admin`, `admin_congregation`, `pastor`,
      `secretary`, `treasurer`, `cell_leader`, `ministry_leader`, `volunteer`,
      `platform_support`) — todos continuam com acesso irrestrito a web e mobile, como hoje.

## Out of Scope

Explicitamente fora desta entrega — documentado para não crescer o escopo no meio do
caminho.

| Item | Motivo |
|---|---|
| Tabela de concessão/revogação de módulo por pessoa (override independente do papel) | Decisão do usuário: só papel decide nesta entrega. Sem schema novo, sem tela de admin. |
| Migrar os outros 9 papéis para um mapa de módulos | Escopo decidido como "só o piso agora" — os demais papéis mantêm acesso irrestrito. |
| Gatear a aba Celebrações no mobile (hoje sem recorte de papel) | Fora do problema relatado; mexeria em mais do que o pedido. |
| Qualquer mudança em `PRODUCT_AREA_READ_ROLES` (a lista de áreas em si) | A lista já está certa — `volunteers` já exclui `member`. O gap é só o mobile não consumir isso. |
| Revisão de `content` (que hoje inclui `member`) | Não foi apontado como problema; mexer ali é decisão de produto separada. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
|---|---|---|---|
| Regra de bloqueio do web | `payload.roles` do JWT recém-emitido não contém nenhum papel diferente de `member` (trata `[]` e `['member']` como bloqueado) | Decisão do usuário: "só papel decide, sem exceção por pessoa agora" | y |
| Onde o bloqueio acontece | `apps/web/src/app/api/session/route.ts`, no `POST`, depois de decodificar o `payload` e antes de gravar qualquer cookie | É o único lugar que já vê o token cru — `POST /auth/login` é compartilhado com o mobile, não dá pra bloquear lá sem quebrar o mobile | y |
| Refresh token emitido pela API antes do bloqueio | O bloqueio acontece **depois** que a API já emitiu o par de tokens. O handler chama `POST /auth/logout` com o `refresh_token` recém-recebido antes de responder 403, para não deixar um refresh token válido órfão | Higiene — evita um token de 7 dias vivo sem cookie nenhum apontando pra ele. `AuthService.logout` já existe e é usado pelo `DELETE` deste mesmo arquivo | n — não discutido; assumido |
| Recheck do bloqueio em `POST /api/session/refresh` | **Não** recheca — a regra vale só no login inicial | Papéis raramente mudam no meio de uma sessão de 7 dias; escopo "só o piso" não pede revalidação contínua. Se a pessoa for promovida, o novo login (ou um refresh que já traga papel atualizado) resolve | n — não discutido; assumido |
| Mensagem/HTTP status do bloqueio | `403` com corpo `{ code: 'WEB_ACCESS_DENIED', message: 'Este acesso é apenas pelo aplicativo Orbien.' }` | Segue o padrão já existente do arquivo (repassa `status` e corpo da API intactos para a tela distinguir); a tela de login (`(public)/login/page.tsx`) já faz `if/else` por `status` — ganha mais um `case` | n — não discutido; assumido |
| Fail-open vs fail-closed no mobile (aba Escala) | Fail-open: se `GET /me/permissions` falhar (rede, token vencido), a aba aparece — quem nega de verdade continua sendo a API nas rotas de voluntariado | Mesma filosofia já documentada em `lib/session.ts` (`fetchAreas`) para o web: "falhar aqui não pode derrubar a sessão... quem nega o acesso de verdade é a API" | n — não discutido; assumido, por consistência com o padrão já existente |
| Quando o mobile busca as áreas | No login e ao restaurar sessão persistida (boot do app) — não em toda navegação | Evita chamada de rede a cada troca de aba; papel não muda dentro da sessão (mesma lógica do web) | n — não discutido; assumido |

**Open questions:** nenhuma sem resposta — tudo acima foi resolvido em conversa ou logado
como assumption.

---

## User Stories

### P1: Bloquear login web do piso ⭐ MVP

**User Story**: Como dono de tenant, quero que ninguém com só o papel `member` consiga
abrir sessão em `web.useorbien.com`, para que o web continue sendo só ferramenta de gestão.

**Why P1**: É um dos dois problemas relatados; sem isso, a automação de import continua
dando acesso a uma tela que não devia abrir.

**Acceptance Criteria**:

1. WHEN uma conta cujo `role_assignments` contém só `member` faz login pelo formulário do
   `apps/web` THEN o sistema SHALL recusar a criação da sessão (nenhum cookie
   `orbien_at`/`orbien_rt`/`orbien_id` é gravado) e responder 403 com
   `code: 'WEB_ACCESS_DENIED'`.
2. WHEN essa mesma conta faz login pelo `apps/mobile` (mesmo `POST /auth/login`) THEN o
   sistema SHALL autenticar normalmente — o bloqueio é exclusivo do broker de sessão do web.
3. WHEN uma conta com `member` **e** qualquer outro papel (ex.: `member` + `volunteer`) faz
   login pelo web THEN o sistema SHALL autenticar normalmente — a regra olha "só member",
   não "tem member".
4. WHEN o bloqueio dispara THEN o sistema SHALL revogar o refresh token recém-emitido
   (`POST /auth/logout`) antes de responder, sem deixar token vivo sem cookie.
5. WHEN a tela de login recebe o 403 com `WEB_ACCESS_DENIED` THEN ela SHALL mostrar
   "Este acesso é apenas pelo aplicativo Orbien." em vez da mensagem genérica de erro.

**Independent Test**: criar um `UserAccount` só com `RoleAssignment('member')`, tentar login
pelo `apps/web` → 403 + mensagem certa, sem cookie. Tentar login com as mesmas credenciais
via chamada direta a `POST /auth/login` (simulando o mobile) → 200 normal.

---

### P1: Esconder Escala/Indisponibilidade de quem não tem `volunteers`

**User Story**: Como voluntário que ainda não serve em nenhuma área, quero não ver a aba de
Escala no app, para não ficar confuso com uma tela que não se aplica a mim.

**Why P1**: É o segundo problema relatado — a aba hoje aparece pra qualquer autenticado.

**Acceptance Criteria**:

1. WHEN o app mobile loga ou restaura uma sessão persistida THEN ele SHALL buscar
   `GET /me/permissions` e guardar as áreas retornadas.
2. WHEN as áreas da sessão **não** incluem `volunteers` THEN a tab bar SHALL omitir a aba
   "Escala" (hoje `(tabs)/index.tsx`).
3. WHEN as áreas da sessão **não** incluem `volunteers` E a pessoa navega diretamente para
   `indisponibilidade.tsx` (deep link, estado antigo, etc.) THEN a tela SHALL mostrar um
   estado "sem acesso" em vez do conteúdo — nunca um crash ou tela em branco.
4. WHEN a busca de áreas falha (rede, token vencido) THEN o app SHALL tratar como "não sei"
   e mostrar a aba normalmente (fail-open) — quem nega de verdade continua sendo a API.
5. WHEN as áreas incluem `volunteers` THEN a aba e a tela aparecem normalmente, sem mudança
   de comportamento.

**Independent Test**: logar com conta só `member` → app não mostra aba Escala; navegar direto
pra rota `indisponibilidade` → tela de "sem acesso". Logar com conta `ministry_leader` → aba
aparece normalmente, tela funciona.

---

## Edge Cases

- WHEN o `role_assignments` da conta está vazio (nenhuma linha, estado inconsistente) THEN o
  web SHALL tratar como bloqueado (mesma regra de "nenhum papel além de member" — lista vazia
  não tem papel além de member, então não escapa da regra).
- WHEN a chamada a `POST /auth/logout` (revogação do refresh token, AC P1-4) falha THEN o
  handler SHALL responder o 403 do bloqueio mesmo assim — a revogação é higiene, não pode
  travar a resposta de erro nem vazar detalhe do 500 pra tela de login.
- WHEN uma sessão de suporte (`support_session: true`) faz login pelo web THEN o bloqueio
  SHALL nunca disparar — sessão de suporte não nasce de `role_assignments` como as demais, e
  `readableAreas()` já trata esse caso à parte; o `payload.roles` de uma sessão de suporte
  não deve ser só `['member']` (é emitida por `POST /auth/impersonate`, fluxo à parte deste
  login). Confirmar no Design que os dois fluxos não se cruzam.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| ACC-01 | P1: Bloquear login web do piso | T2 | Verified |
| ACC-02 | P1: Bloquear login web do piso | T2 | Verified |
| ACC-03 | P1: Bloquear login web do piso | T2 | Verified |
| ACC-04 | P1: Bloquear login web do piso | T1, T2 | Verified |
| ACC-05 | P1: Bloquear login web do piso | T3 | Verified |
| ACC-06 | P1: Esconder Escala/Indisponibilidade | T4, T5, T8 | Verified |
| ACC-07 | P1: Esconder Escala/Indisponibilidade | T6, T8 | Verified |
| ACC-08 | P1: Esconder Escala/Indisponibilidade | T7 | Verified |
| ACC-09 | P1: Esconder Escala/Indisponibilidade | T8 | Verified |

**Coverage:** 9 total, 9 mapeados a tasks, 0 não mapeados

---

## Success Criteria

- [x] Conta só-`member` recebe 403 claro ao tentar logar em `web.useorbien.com`, sem cookie
      gravado.
- [x] A mesma conta loga normalmente no mobile.
- [x] Nenhum dos outros 9 papéis perde acesso a nada que tinha antes (suite de testes
      existente de `auth`, `users`, `persons-import` continua verde).
- [x] Aba Escala e tela Indisponibilidade somem no mobile para quem não tem `volunteers`, e
      continuam normais para quem tem.
