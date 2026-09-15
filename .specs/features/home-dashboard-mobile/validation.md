# Validação — Home do app mobile

Passe standalone (sem sub-agente — escopo Medium, ≤8 tarefas, execução inline).

## Cobertura por requisito

| ID | Critério de aceite | Evidência | Veredito |
|---|---|---|---|
| HOME-01 | Saudação por horário, função pura testável sem mock de `Date` global | `getGreeting` em `src/lib/format/date.ts`; 6 asserções em `date.test.ts` cobrindo os dois lados de 12h e 18h; `home-greeting` renderizado em `index.tsx` e testado em `index.test.tsx` | ✅ Verified |
| HOME-02 | Até 2 grupos, degradação silenciosa em vazio/erro, toque navega | `index.tsx` (`groups.slice(0, MAX_HOME_GROUPS)`); testes: 3 grupos → 2 visíveis, 0 grupos → seção ausente, rejeição → seção ausente sem `escala-error`, toque → `router.push("/grupo/g1")` | ✅ Verified |
| HOME-03 | Até 3 posts, mesma degradação, toque navega | `getPosts(1, MAX_HOME_POSTS)`; testes equivalentes aos de HOME-02, incluindo a asserção de que a chamada usa `(1, 3)` | ✅ Verified |
| HOME-04 | Escala (MOB-04) inalterada — mesmos testIDs e comportamento | Suíte original de `index.test.tsx` (12 casos: AC1-3, guard de duplo toque, erros) não teve nenhuma asserção alterada, só os dois mocks novos (`listMyGroups`/`getPosts`) com resolução vazia no `beforeEach` para não afetar os casos existentes — todos os 12 continuam verdes | ✅ Verified |
| HOME-05 | Ordem visual | `BrandHeader` → `home-greeting` → `indisponibilidade-link` → `home-groups-section` (se houver) → `home-posts-section` (se houver) → `escala-list`, na ordem lida do JSX | ✅ Verified |

## Sensor de discriminação

Os testes novos falham se a implementação regredir: removido o `.slice(0, 2)` de HOME-02, o teste "mostra até 2 grupos" veria `home-group-g3` e falharia; removido o `.catch` silencioso, o teste de erro veria `escala-error` aparecer. Conferido manualmente invertendo cada uma dessas linhas e rodando a suíte — os três testes correspondentes (HOME-02 slice, HOME-02 erro, HOME-03 erro) quebram como esperado, confirmando que não são vacuously true.

## Gate

- `npx tsc --noEmit -p apps/mobile/tsconfig.json` — limpo.
- `npx turbo run lint --filter=orbien-mobile` — 0 erros (mesmos 79 warnings pré-existentes em arquivos não tocados por esta feature).
- `npm run test -w orbien-mobile` — 41 suítes / 264 testes, 0 falhas.
- `npm run test:cov -w orbien-mobile` — 94.25/84.67/94.06/98.08, os quatro acima do piso da Fase 15 (94/84/93/97).

## Achado de portão, apresentado e corrigido nesta sessão

3 suítes (7 testes) falhavam por `NativeAnimatedHelper` sem mock em
`jest.setup.js` — pré-existente, confirmado com `git stash` antes de tocar
em qualquer arquivo desta feature, não causado por ela. Apresentado ao
usuário como achado de portão (regra do `CLAUDE.md`); a decisão foi
investigar e corrigir agora, não só registrar. Correção e evidência
completa em `docs/PENDENCIAS.md`, seção "`NativeAnimatedHelper` sem mock
derrubava o piso de cobertura do mobile".
