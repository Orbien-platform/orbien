# Módulo Kids Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `fillsd` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/modulo-kids/design.md`
**Status**: Approved (spec confirmada em 2026-10-26)

Antes de qualquer Edit em `apps/web` ou `apps/mobile`, carregar a skill `frontend-design` (hook `require-frontend-design.mjs`). Testes só em `teste1-church` e `teste2-church`. Antes de subir: `bash scripts/pre-push.sh` verde.

## Test Coverage Matrix

> Guidelines found: `CLAUDE.md` (portão e RLS), `apps/web/AGENTS.md`, `apps/mobile/AGENTS.md`, `apps/api/package.json`. Jest da API só roda `test/**/*.spec.ts`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
|---|---|---|---|---|
| Serviço/regra da API (kids) | unit | 1:1 com os ACs; todo caso de borda da spec | `apps/api/test/**/kids*.spec.ts` | `npm run test:unit -w orbien-backend` |
| Controller/rotas kids | integration | Cada rota: feliz + borda + erro (403/409/422) | `apps/api/test/integration/kids-*.spec.ts` | `npm run test:integration -w orbien-backend` |
| Isolamento multi-tenant/congregação | RLS | Toda tabela nova: leitura e escrita cruzadas, `USING` = `WITH CHECK` | `apps/api/test/rls/kids.spec.ts` | `npm run test:rls -w orbien-backend` |
| Componente/tela web | unit (vitest) | Estados vazio, erro, alergia, recusa | `apps/web/src/**/*.test.tsx` | `npm run test -w orbien-web` |
| Fluxo web de balcão | e2e | Check-in e check-out feliz + recusa | `apps/web/e2e/kids*.spec.ts` | `npm run e2e -w orbien-web` |
| Tela mobile | unit (jest) | Responsável: check-in; equipe: roster | `apps/mobile/src/__tests__/app/kids/**` | `npm run test -w orbien-mobile` |
| Schema/migration/SQL | none | build + RLS | — | build gate |

## Gate Check Commands

| Gate Level | When to Use | Command |
|---|---|---|
| Quick | Tarefa só com unit | `npm run test:unit -w orbien-backend` / `npm run test -w orbien-web` / `npm run test -w orbien-mobile` |
| Full | Rotas, RLS, e2e | `npm run test:integration -w orbien-backend && npm run test:rls -w orbien-backend` e `npm run e2e -w orbien-web` |
| Build | Fim de fase | `bash scripts/pre-push.sh` (build, tipos, lint, testes, cobertura, RLS, e2e escopado) |

---

## Execution Plan

```
F1 Dados ──► F2 API turmas/sessões ──► F3 API criança/consentimento ──► F4 API check-in/out
                                                                           │
                              ┌────────────────────────────────────────────┤
                              ▼                                            ▼
                     F5 Escala + contagem                           F6 Web (balcão e gestão)
                                                                           │
                                                                           ▼
                                                                    F7 Mobile ──► F8 Docs e fechamento
```

## Tasks

### F1 — Dados e RLS

- [x] **T1** Schema Prisma: `KidsRoom`, `KidsSession`, `KidsGuardian`, `KidsCheckin`, enum, `Person.is_child`, `CelebrationMinistry.kids_session_id` + migration. *Depends:* — · *Tests:* none (build) · *Reqs:* KIDS-01,02,05,08
- [x] **T2** SQL do índice único parcial de check-in aberto na migration. *Depends:* T1 · *Tests:* RLS/integração em T4 · *Reqs:* KIDS-08
- [x] **T3** `029_rls_kids.sql` com `app_congregation_allowed()` simétrico. *Depends:* T1 · *Tests:* none · *Reqs:* KIDS-01
- [x] **T4** Registrar `029` no `bootstrap-db.sh` (antes do passo 4) + verificação no passo 7. *Depends:* T3 · *Tests:* rodar bootstrap · *Reqs:* KIDS-01
- [x] **T5** Teste RLS `kids.spec.ts`: cada tabela, cross-congregação e cross-tenant. *Depends:* T4 · *Tests:* RLS · *Reqs:* KIDS-01

### F2 — API: turmas e sessões

- [x] **T6** `KidsRoomsService` + DTOs (faixa obrigatória, `allows_out_of_range`). *Depends:* T5 · *Tests:* unit · *Reqs:* KIDS-01
- [x] **T7** `KidsRoomsController` (CRUD, desativar). *Depends:* T6 · *Tests:* integração · *Reqs:* KIDS-01
- [x] **T8** `KidsSessionsService`: abrir (409 no par), cancelar (422 com check-in aberto). *Depends:* T6 · *Tests:* unit · *Reqs:* KIDS-02
- [x] **T9** `KidsSessionsController` (`/celebrations/instances/:id/kids-sessions`). *Depends:* T8 · *Tests:* integração · *Reqs:* KIDS-02
- [x] **T10** Modelo de turmas padrão por celebração + aplicação em lote. *Depends:* T9 · *Tests:* unit + integração · *Reqs:* KIDS-03

### F3 — API: criança, responsáveis e consentimento

- [x] **T11** `KidsConsentService` (`ConsentRecord origin='kids'`, versão, revogação). *Depends:* T5 · *Tests:* unit · *Reqs:* KIDS-06
- [x] **T12** `KidsChildrenService.create/update` (Person `is_child`, Household, 422 sem consentimento, cadastro pela secretaria). *Depends:* T11 · *Tests:* unit · *Reqs:* KIDS-04
- [x] **T13** `KidsGuardiansService` (terceiro autorizado, ≥1 primário). *Depends:* T12 · *Tests:* unit · *Reqs:* KIDS-05
- [x] **T14** Filtro `is_child=false` em `persons.service.ts` e demais listagens/indicadores. *Depends:* T1 · *Tests:* unit por listagem · *Reqs:* AD-013
- [x] **T15** `KidsChildrenController` + `KidsGuardiansController` + auditoria de leitura de saúde. *Depends:* T13,T14 · *Tests:* integração · *Reqs:* KIDS-04,05,07

### F4 — API: check-in e check-out

- [x] **T16** Gerador de código único por sessão. *Depends:* T5 · *Tests:* unit (colisão) · *Reqs:* KIDS-08
- [x] **T17** `KidsCheckinService.checkIn` (responsável que entrega e quem recebe obrigatórios, faixa com `allows_out_of_range`, capacidade só avisa, 409, consentimento). *Depends:* T8,T15,T16 · *Tests:* unit · *Reqs:* KIDS-08
- [x] **T18** `KidsCheckinService.checkOut` + `override` com motivo e evento de auditoria. *Depends:* T17 · *Tests:* unit · *Reqs:* KIDS-09
- [x] **T19** `KidsCheckinController` + roster. *Depends:* T18 · *Tests:* integração (403 genérico, concorrência) · *Reqs:* KIDS-08,09
- [x] **T20** Etiquetas (dados + PDF/HTML), sem QR. *Depends:* T19 · *Tests:* unit · *Reqs:* KIDS-08
- [x] **T19b** Código de retirada fora do roster; `GET /kids/children/:id/checkin` devolve o check-in aberto com `code` ao responsável (decisão do dono, 2026-10-26). *Depends:* T19 · *Tests:* unit + integração · *Reqs:* KIDS-08,09
- [x] **T19c** `PATCH /kids/guardians/:id` (`can_pickup`, `is_primary`, `relationship`), ≥ 1 primário, troca atômica. *Depends:* T15 · *Tests:* unit + integração (400/403/404/422) · *Reqs:* KIDS-05
- [x] **T19d** Push "Criança entregue" ao responsável primário no check-out e no override, categoria própria `kids` (AD-003). *Depends:* T18 · *Tests:* unit + integração · *Reqs:* KIDS-09
- [x] **T19e** `GET /kids/sessions/open`: sessões kids abertas de hoje (sem dado de criança/saúde) para o responsável fazer o check-in do próprio filho; volunteer só as escaladas. *Depends:* T19 · *Tests:* unit + integração · *Reqs:* KIDS-08

### F5 — Escala e contagem

- [x] **T21** `kids_session_id` na escala + `kids_session` em `my-celebration-assignments` + mínimo de voluntários. *Depends:* T9 · *Tests:* unit + integração · *Reqs:* KIDS-10
- [x] **T22** `checkin_total` na contagem de público como valor inicial de `children`, editável (sem mudar o contrato do `PUT`). *Depends:* T19 · *Tests:* unit · *Reqs:* KIDS-11
- [x] **T23** `GET /kids/attendance/summary` (média por turma, vazio ≠ zero). *Depends:* T19 · *Tests:* unit + integração · *Reqs:* KIDS-12

### F6 — Web

- [x] **T24** Tipos e cliente `lib/kids`. *Depends:* T19 · *Tests:* unit · *Reqs:* —
- [x] **T25** Tela de turmas. *Depends:* T24 · *Tests:* componente · *Reqs:* KIDS-01
- [x] **T26** Sessões no detalhe da celebração (abrir 0..N, modelo). *Depends:* T24 · *Tests:* componente · *Reqs:* KIDS-02,03
- [x] **T27** Ficha da criança e responsáveis (alergia em destaque). *Depends:* T24 · *Tests:* componente · *Reqs:* KIDS-04,05,07
- [x] **T28** Balcão: busca, check-in, roster, check-out, recusa, etiqueta `@page`. *Depends:* T24 · *Tests:* componente + e2e · *Reqs:* KIDS-08,09
- [x] **T29** Cartão Kids em `/pessoas/indicadores` e contagem sugerida. *Depends:* T22,T23 · *Tests:* componente · *Reqs:* KIDS-11,12

### F7 — Mobile

- [x] **T30** Cliente `lib/kids` e ícones em `theme/icons.ts`. *Depends:* T19 · *Tests:* unit · *Reqs:* —
- [x] **T31** Responsável: filhos, cadastro, consentimento, autorizados. *Depends:* T30 · *Tests:* jest · *Reqs:* KIDS-04,05,06
- [x] **T32** Responsável: check-in e tela do código grande. *Depends:* T30 · *Tests:* jest · *Reqs:* KIDS-08
- [x] **T33** Equipe: roster da sessão e check-out por código. *Depends:* T30 · *Tests:* jest · *Reqs:* KIDS-09
- [x] **T34** "Minhas escalas" mostra turma da sessão. *Depends:* T21 · *Tests:* jest · *Reqs:* KIDS-10
- [x] **T34b** Preferência de notificação `kids` (toggle, tag OneSignal `pref_kids`) e tag `person_id` registrada pelo app. *Depends:* T19d · *Tests:* jest · *Reqs:* KIDS-09
- [x] **T32b** Check-in do responsável por `GET /kids/sessions/open` (sessões abertas de hoje, sem `instanceId` na rota; estado vazio "Hoje não há turma aberta"). *Depends:* T32 · *Tests:* jest · *Reqs:* KIDS-08

### F8 — Documentos e seed

- [x] **T35** Seed de turmas e crianças em `teste1-church`/`teste2-church`. *Depends:* T19 · *Tests:* none · *Reqs:* —
- [x] **T35b** Job de retenção: anonimizar check-ins com mais de 12 meses, pulando responsável membro ativo. *Depends:* T19 · *Tests:* unit (membro ativo, ex-membro) · *Reqs:* KIDS-06
- [x] **T36** Atualizar `orbien-lgpd-mapping.md`, termo do responsável e `docs/PLANO.md` (PROD-kids). *Depends:* T15 · *Tests:* `node scripts/check-skills.mjs` não se aplica · *Reqs:* KIDS-06
- [x] **FIX1** (S1 do validation.md) Reimpressão de etiquetas só para quem fez o check-in e com ele aberto; 403 aos demais, gestão e voluntário escalado inclusos. *Depends:* T19 · *Tests:* jest unit + integration · *Reqs:* KIDS-09
- [x] **FIX2** (M12) Teste de integração assere `classification === 'visitor'` do terceiro autorizado. *Depends:* T10 · *Tests:* jest integration · *Reqs:* KIDS-03

### R3 — Rodada 3 (decisões do dono, 2026-10-29)

- [x] **R3-1** QR para check-in e check-out (portador dos mesmos segredos): `POST /kids/children/:id/qr`, `POST /kids/sessions/:id/checkins/by-qr`, `qr` em `GET /kids/children/:id/checkin` e `{ qr }` no check-out; tabela `kids_checkin_qr_tokens` + `032_rls_kids_checkin_qr_tokens.sql`. *Depends:* T19b · *Tests:* unit + integração + RLS (uso único, expiração, forjado, regras do check-in, concorrência) · *Reqs:* KIDS-08,09
- [x] **R3-2** Limite de 5 tentativas de código no check-out: coluna `kids_checkins.checkout_failed_attempts` (migration) + `kids_register_checkout_failure()` SECURITY DEFINER (`031_rls_kids_checkout_attempts.sql`, no bootstrap e no passo 7), travamento com o mesmo 403, auditoria `kids.checkout_locked` e push ao líder. *Depends:* T18 · *Tests:* unit + integração (4+acerto, 5+certo, override, concorrência) · *Reqs:* KIDS-09
- [x] **R3-3** Push "Criança recebida na turma X" ao primário (check-in por outra pessoa) e "Criança entregue" também aos demais responsáveis com `can_pickup` e conta (sem duplicar quem retirou). *Depends:* T19d · *Tests:* unit + integração por destinatário (inclui quem NÃO recebe) · *Reqs:* KIDS-09
- [x] **R3-4** `GET /kids/guardians/search?q=` (adultos da congregação, limite 20, telefone mascarado) para `KIDS_MANAGE_ROLES`. *Depends:* T13 · *Tests:* unit + integração (papéis, isolamento teste1×teste2, sem criança) · *Reqs:* KIDS-04,05
- [x] **R3-5** `checkin_total` por instância em `GET /celebrations/instances` (uma agregação, sem N+1) e conferência de que `ministry_leader` lê a contagem (papéis de READ já o incluíam; nada corrigido). *Depends:* T22 · *Tests:* unit + integração · *Reqs:* KIDS-11
- [x] **R3-6** `029_rls_kids.sql` com `ENABLE`/`FORCE ROW LEVEL SECURITY` explícitos por tabela (o laço `DO $$` escondia as quatro tabelas do grep de `scripts/pre-push.sh`, que alertava em falso). *Depends:* T3 · *Tests:* bootstrap + `test:rls` + grep do portão (mutação: tirar o `ENABLE` de uma tabela faz o alerta voltar) · *Reqs:* KIDS-01

### R3-web — Rodada 3, front web (decisões do dono, 2026-10-29)

- [x] **WEB-1** Leitura de QR no balcão: check-in por QR (`POST /kids/sessions/:id/checkins/by-qr`, leitor de mão como teclado e câmera via `BarcodeDetector` com fallback para o campo de texto; fora da faixa pede a confirmação já existente) e check-out por QR (`{ qr }` como o código digitado, localizando o check-in pelo `checkin_id` do QR); mesma recusa genérica e, após 3 recusas seguidas no mesmo check-in, "Chame o líder kids" com a retirada por exceção em destaque. *Depends:* R3-1,R3-2 · *Tests:* componente + unit (vitest) · *Reqs:* KIDS-08,09
- [x] **WEB-2** Cadastro de criança (T27) busca o responsável em `GET /kids/guardians/search?q=` (nome/telefone mascarado; vale para `ministry_leader`) e perde a mensagem "Seu papel não busca pessoas". *Depends:* R3-4 · *Tests:* componente (resultado, vazio, erro, 403) · *Reqs:* KIDS-04,05
- [x] **WEB-3** `CelebrationDetailSheet` passa `checkin_total` da instância como `suggestedChildren` ao `AttendanceFormModal`. *Depends:* R3-5 · *Tests:* componente · *Reqs:* KIDS-11
- [x] **WEB-4** Causa raiz do teste intermitente `CostCentersModal.test.tsx` ("dismisses the delete confirmation on escape"), corrigida sem skip nem asserção enfraquecida; prova com 30+ execuções em loop e em paralelo com a suíte. *Depends:* — · *Tests:* o próprio arquivo · *Reqs:* —
- [x] **WEB-5** Remove `getLabels` (e seu teste) de `lib/kids.ts` se continuar sem uso: a reimpressão agora só vale a quem fez o check-in e a tela imprime com os `labels` do POST. *Depends:* FIX1 · *Tests:* grep + suíte · *Reqs:* KIDS-09

### MOB — Mobile da Rodada 3

- [x] **MOB-1** QR do responsável para check-in: `POST /kids/children/:id/qr`, tela com QR grande, contagem regressiva do TTL, "Gerar novo QR" ao expirar/após uso, atalhos na ficha e no check-in (o manual por turma segue). *Depends:* R3-1 · *Tests:* jest · *Reqs:* KIDS-08
- [x] **MOB-2** QR no check-out: `qr` de `GET /kids/children/:id/checkin` na tela do código, junto do código (que segue o elemento principal). *Depends:* MOB-1 · *Tests:* jest · *Reqs:* KIDS-09
- [x] **MOB-3** Leitura de QR pela equipe na turma: check-in por QR (`by-qr`, fora da faixa, 403 genérico) e check-out por QR (`kidsco1.`), 3 recusas seguidas sugerem o líder e destacam a exceção, câmera negada leva ao código digitado. *Depends:* MOB-2 · *Tests:* jest · *Reqs:* KIDS-08,09
- [x] **MOB-4** Toque nos push `kids_child_received`, `kids_child_released` e `kids_checkout_locked` abre a criança/turma. *Depends:* R3-3 · *Tests:* jest · *Reqs:* KIDS-09

### COV — Lacunas de cobertura de testes (validation.md, PROD-39)

- [x] **COV-1** Sessão de suporte (`POST /auth/impersonate`, `support_session: true`) nas rotas kids: GET aceito pelo `RolesGuard` com `support_access` em `audit_logs`; roster, ficha/saúde e check-in/out sem dado de criança nem escrita. *Depends:* T19 · *Tests:* integração (mutação: guard, auditoria, papéis) · *Reqs:* KIDS-08,09 (L2 do validation)
- [x] **COV-2** `PATCH /kids/guardians/:id` concorrente (duas promoções a primário; promoção × rebaixamento): sempre exatamente 1 primário; prova do `FOR UPDATE` com corrida real no banco. *Depends:* T15 · *Tests:* integração (mutação: remover o lock) · *Reqs:* KIDS-05 (M6b)
- [x] **COV-3** Culto encerrado com criança presente: roster mostra, o check-out segue possível e o override com motivo fecha; resumo de presença não a perde. *Depends:* T19 · *Tests:* integração · *Reqs:* KIDS-09 (edge case)
- [x] **COV-4** Turma desativada com sessão aberta: sessão aberta segue operável (check-in/roster/check-out) e nova sessão da turma dá 422. *Depends:* T8 · *Tests:* integração · *Reqs:* KIDS-01 (edge case)
- [x] **COV-5** Troca de escala (celebration-swap) de sessão kids: quem aceita ganha roster/check-in da sessão, quem trocou perde. *Depends:* T21 · *Tests:* integração ponta a ponta (fluxo real de swap) · *Reqs:* KIDS-10 (AC 1 de Escala)
- [x] **COV-6** Cobertura global: `npm run test:cov -w orbien-backend` sem baixar o piso (100%); testes para o que o Kids deixar descoberto. *Depends:* COV-1..5 · *Tests:* unit + integração · *Reqs:* —

### FIX — Correções de revisão

- [ ] **FIX3** `data` dos push `kids_child_received`/`kids_child_released` passa a levar `child_id` (`{ type, checkin_id, session_id, child_id }`); `kids_checkout_locked` conferido (`{ type, session_id, checkin_id }`); contrato em design.md. *Depends:* R3-3,MOB-4 · *Tests:* unit + integração com `toEqual` no `data` (mutação: tirar `child_id` quebra) · *Reqs:* KIDS-09
- [x] **FIX4** Causa raiz do flaky "contador atômico: 8 erros simultâneos" (`kids-checkout-lock.spec.ts`): com o contador em 5 a tentativa seguinte é recusada como `locked` sem contar (design R3-2), então quantas das 8 contam depende da carga — o teste cravava o agendamento. Teste passa a afirmar a correção (sem atualização perdida, contadas + `locked` = 8, ≥ 5, exatamente UMA `kids.checkout_locked`) e ganha o caso de exatamente 5 simultâneas (soma 5, determinístico); código de produção correto, intocado. *Depends:* R3-2 · *Tests:* o próprio arquivo, 16 execuções isoladas + 8 em paralelo com outras suítes kids, 0 falhas (mutação: contagem perdida quebra) · *Reqs:* KIDS-09
- [x] **FIX5** Causa raiz do intermitente em `kids-guardians-concurrency` ("três promoções simultâneas"): corrida REAL de produção. O `SELECT id FROM kids_guardians WHERE child_id = $1 FOR UPDATE` do `PATCH /kids/guardians/:id` travava as linhas sem `ORDER BY`; a ordem física muda a cada UPDATE, então duas edições travavam as mesmas linhas em sequências opostas e o Postgres abortava uma com deadlock (40P01), que virava HTTP 500. Correção: `ORDER BY id` no lock (ordem global fixa, sem deadlock); a invariante (1 primário) e a regra do `add` (aceita mais de um primário) ficam intactas. *Depends:* KIDS-05 · *Tests:* o próprio `kids-guardians-concurrency.spec.ts`, 60 execuções isoladas + 20 sob carga, 0 falhas (mutação: tirar o `ORDER BY` reproduz o 500) · *Reqs:* KIDS-05

### DEC — Decisões do dono (2026-10-29)

- [x] **DEC-1** Culto cancelado não conta nada: `checkin_total` (instâncias, escala, sugestão de contagem) = 0 em instância cancelada, como o resumo já fazia; check-in aberto segue fechável. Lacuna do spec vira critério definitivo. *Depends:* COV-3 · *Tests:* integração (um por superfície, mutação restaurada) + unit · *Reqs:* KIDS-09,11
- [x] **DEC-2** Folga de cobertura do web: branches ≥ 97,5% com testes reais nos arquivos de menor cobertura do Kids, sem tocar o piso. *Depends:* — · *Tests:* vitest · *Reqs:* —
- [x] **DEC-3** `test:cov` da API sem OOM no CI: heap do Node fixado no script versionado; motivo em docs/CI.md e docs/TESTES.md. *Depends:* COV-6 · *Tests:* o próprio `npm run test:cov` sem variável de ambiente · *Reqs:* —

---

## Validation Tables

**Granularidade** — cada tarefa entrega um arquivo/endpoint/componente: ✅ todas. Maior fase: F4/F6 com 5–6 tarefas (< 10).

**Diagrama × `Depends on`**

| Aresta do diagrama | Tarefas | Confere |
|---|---|---|
| F1→F2 | T6 depende de T5 | ✅ |
| F2→F3 | F3 depende só de F1 (T11,T14) — paralelizável | ✅ (diagrama conservador) |
| F3→F4 | T17 depende de T15 | ✅ |
| F4→F5 | T21 depende de T9; T22,T23 de T19 | ✅ |
| F4→F6 | T24 depende de T19 | ✅ |
| F6/F4→F7 | T30 depende de T19 | ✅ |
| F3→F8 | T36 depende de T15 | ✅ |

**Co-localização de testes** — toda tarefa de serviço/rota/tela tem o teste exigido pela matriz na própria tarefa; T1–T4 e T35–T36 são `none` (build/gate): ✅.

## Cobertura de requisitos

KIDS-01..12 mapeados (01:T3–T7, 02:T8–T9, 03:T10, 04:T12/T15, 05:T13, 06:T11, 07:T15, 08:T17–T20, 09:T18–T19, 10:T21, 11:T22, 12:T23). **12/12.**

## Execução

37 tarefas > ~8: pela skill, ofereço sub-agentes por **fase inteira** (F2–F3 podem ir em paralelo; F6 e F7 também após F4). O Verifier roda sozinho ao fim.
