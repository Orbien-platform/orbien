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
- [x] **T3** `028_rls_kids.sql` com `app_congregation_allowed()` simétrico. *Depends:* T1 · *Tests:* none · *Reqs:* KIDS-01
- [x] **T4** Registrar `028` no `bootstrap-db.sh` (antes do passo 4) + verificação no passo 7. *Depends:* T3 · *Tests:* rodar bootstrap · *Reqs:* KIDS-01
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

### F5 — Escala e contagem

- [x] **T21** `kids_session_id` na escala + `kids_session` em `my-celebration-assignments` + mínimo de voluntários. *Depends:* T9 · *Tests:* unit + integração · *Reqs:* KIDS-10
- [x] **T22** `checkin_total` na contagem de público como valor inicial de `children`, editável (sem mudar o contrato do `PUT`). *Depends:* T19 · *Tests:* unit · *Reqs:* KIDS-11
- [x] **T23** `GET /kids/attendance/summary` (média por turma, vazio ≠ zero). *Depends:* T19 · *Tests:* unit + integração · *Reqs:* KIDS-12

### F6 — Web

- [x] **T24** Tipos e cliente `lib/kids`. *Depends:* T19 · *Tests:* unit · *Reqs:* —
- [x] **T25** Tela de turmas. *Depends:* T24 · *Tests:* componente · *Reqs:* KIDS-01
- [x] **T26** Sessões no detalhe da celebração (abrir 0..N, modelo). *Depends:* T24 · *Tests:* componente · *Reqs:* KIDS-02,03
- [x] **T27** Ficha da criança e responsáveis (alergia em destaque). *Depends:* T24 · *Tests:* componente · *Reqs:* KIDS-04,05,07
- **T28** Balcão: busca, check-in, roster, check-out, recusa, etiqueta `@page`. *Depends:* T24 · *Tests:* componente + e2e · *Reqs:* KIDS-08,09
- **T29** Cartão Kids em `/pessoas/indicadores` e contagem sugerida. *Depends:* T22,T23 · *Tests:* componente · *Reqs:* KIDS-11,12

### F7 — Mobile

- [x] **T30** Cliente `lib/kids` e ícones em `theme/icons.ts`. *Depends:* T19 · *Tests:* unit · *Reqs:* —
- [x] **T31** Responsável: filhos, cadastro, consentimento, autorizados. *Depends:* T30 · *Tests:* jest · *Reqs:* KIDS-04,05,06
- [x] **T32** Responsável: check-in e tela do código grande. *Depends:* T30 · *Tests:* jest · *Reqs:* KIDS-08
- [x] **T33** Equipe: roster da sessão e check-out por código. *Depends:* T30 · *Tests:* jest · *Reqs:* KIDS-09
- [x] **T34** "Minhas escalas" mostra turma da sessão. *Depends:* T21 · *Tests:* jest · *Reqs:* KIDS-10

### F8 — Documentos e seed

- **T35** Seed de turmas e crianças em `teste1-church`/`teste2-church`. *Depends:* T19 · *Tests:* none · *Reqs:* —
- **T35b** Job de retenção: anonimizar check-ins com mais de 12 meses, pulando responsável membro ativo. *Depends:* T19 · *Tests:* unit (membro ativo, ex-membro) · *Reqs:* KIDS-06
- **T36** Atualizar `orbien-lgpd-mapping.md`, termo do responsável e `docs/PLANO.md` (PROD-kids). *Depends:* T15 · *Tests:* `node scripts/check-skills.mjs` não se aplica · *Reqs:* KIDS-06

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
