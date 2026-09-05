# Testes — plano para 100% de cobertura

Meta declarada: **100% de cobertura nos quatro apps** (`statements`, `branches`,
`functions`, `lines`), travada no CI.

O plano é dividido em fases que podem ser executadas **uma por sessão de
chat**, de forma independente. Cada fase abaixo é autocontida: diz o que ler,
o que escrever, e qual comando prova que terminou. Não é preciso ter o
contexto das fases anteriores além do que está escrito aqui.

---

## Estado

Marque ao concluir. Este quadro é a fonte da verdade entre sessões.

| # | Fase | Escopo | Arquivos | Feito |
|---|---|---|---|---|
| 0 | Infra e instrumentação | jest projects, vitest, gate no CI | — | ☑ |
| 1 | API — financeiro | `financial/`, `common/` | 37 | ☑ |
| 2 | API — auth e raiz | `auth/`, `prisma/`, `app.*` | 18 | ☑ |
| 3 | API — pessoas | `persons/`, `visitor/`, `waitlist/` | 34 | ☑ |
| 4 | API — celebrações | `celebrations/` | 46 | ☑ |
| 5 | API — voluntários e grupos | `volunteers/`, `small-groups/` | 36 | ☑ |
| 6 | API — conteúdo e apoio | `content/`, `settings/`, `study-materials/`, `mail/`, `storage/` | 30 | ☑ |
| 7 | web — lib, hooks, contexts | `lib/`, `hooks/`, `contexts/`, `proxy.ts` | 10 | ☑ |
| 8 | web — componentes base | `components/ui/`, `layout/`, `dashboard/`, `providers/` | 21 | ☑ |
| 9 | web — componentes de domínio | `components/` restantes | 28 | ☑ |
| 10 | web — rotas | `app/` | 14 | ☐ |
| 11 | site — componentes | `components/`, `lib/` | 57 | ☑ |
| 12 | site — rotas | `app/` | 18 | ☑ |
| 13 | Fechamento | threshold global em 100, e2e dos fluxos faltantes | — | ◐ |

Ponto de partida medido em 2026-09-02: **1 suíte na API** (39 testes de RLS,
`test/rls/isolation.spec.ts`), **2 testes e2e no web** (escalas e templates),
**nada no site**. Nenhuma instrumentação de cobertura em lugar nenhum.

`◐` = parcial. A Fase 13 rodou o que não depende da Fase 10 (e2e dos fluxos
faltantes, smoke do site, `global: 100` travado na API e no site); o que
depende dela segue aberto. Ver "Estado da Fase 13" abaixo.

**Medido em 2026-09-05**, já com as Fases 11 e 12 mescladas da `main`:

| App | Statements | Branches | Functions | Lines | Suítes |
|---|---|---|---|---|---|
| api | 100% | 100% | 100% | 100% | 213 (1883 testes) |
| web | 68,5% | 63,3% | 66,8% | 68,3% | 63 (608 testes) |
| site | 100% | 100% | 100% | 100% | 75 (280 testes) |
| admin | 1,5% | 1,0% | 0,8% | 1,6% | 1 (4 testes) |

Dois números aí não estão no quadro de fases, e é isso que eles dizem:

- **`apps/admin` nunca teve fase.** O console nasceu depois que o plano foi
  escrito. O quadro vai de 0 a 13 sem mencioná-lo, mas o "Pronto quando" da
  Fase 13 cobrava `test:cov -w orbien-admin` em 100% — cobrança sem fase que a
  produzisse. A checklist foi corrigida; a fase não foi criada (decisão do dev
  nesta sessão). Enquanto não existir, `apps/admin` fica fora da meta.
- **`src/platform/` na API** é o mesmo caso, e mostra o custo do threshold por
  caminho: nasceu depois das fases 1-6, não entrou em nenhuma entrada da lista
  de caminhos, e ficou com dois DTOs abaixo de 100% **sem reprovar nada**. Os
  dois specs que faltavam foram escritos nesta sessão, e o `global` que
  substituiu a lista não tem esse ponto cego.

---

## O que conta como cobertura

Decisão que precisa estar clara antes da Fase 0, porque define se o número
fecha ou não:

- **Cobertura é medida por Jest (api) e Vitest (web, site).** Os testes
  Playwright **não contam** para o percentual. Eles continuam existindo e
  continuam sendo portão de CI — mas instrumentar cobertura através de um
  browser real custa mais do que entrega, e faz o número oscilar por motivo
  não relacionado ao código.
- **A meta é sobre `src/`.** `test/`, `e2e/`, `scripts/` e `prisma/migrations`
  ficam fora do denominador — são o instrumento de medida, não o medido.

### Exclusões

A lista é curta de propósito. Cada linha precisa de justificativa; não
adicione mais nenhuma sem registrar o porquê aqui.

| Caminho | Por quê |
|---|---|
| `apps/api/src/main.ts` | bootstrap com `listen()`. Cobrir exigiria subir a aplicação a cada run de unidade |
| `**/*.d.ts` | declaração de tipo, não gera código |
| `apps/api/src/prisma/**` (client gerado) | código gerado pelo Prisma, não é nosso |

O que **não** está excluído, e é uma escolha deliberada:

- **`*.module.ts` (17 arquivos).** São metadados de DI, mas executam na
  importação — qualquer `Test.createTestingModule` que importe o módulo já os
  cobre. Excluí-los esconderia um provider mal registrado.
- **`dto/**` (86 arquivos).** Os decorators de `class-validator` executam na
  importação. Além disso, testar validação de DTO é barato e pega bug real
  (campo opcional que deveria ser obrigatório).

Com essas três exclusões, 100% é alcançável sem ginástica.

---

## Fase 0 — Infra e instrumentação

**Pré-requisito:** nenhum. Comece por aqui.

**Não escreve nenhum teste novo.** Entrega a instrumentação e o portão; o
número inicial vai ser baixo e está tudo bem.

### 0.1 API

`@nestjs/testing` **não está instalado**. Sem ele não há como testar guard,
interceptor, controller ou módulo — só classe pura. É bloqueador das fases 1–6.

```bash
# A major precisa ser fixada: sem ela o npm resolve @nestjs/testing@12, que
# tem peer @nestjs/common@^12 e conflita com o Nest 10 desta API.
npm i -D "@nestjs/testing@^10.4.0" supertest @types/supertest -w orbien-backend
```

Reescrever [`apps/api/jest.config.js`](../apps/api/jest.config.js). Hoje o
`testMatch` é `<rootDir>/test/**/*.spec.ts`, o que **exclui `src/`** — nenhum
teste ao lado do código seria sequer descoberto. Passar para três projetos:

```js
/** @type {import('jest').Config} */
const tsJest = ['ts-jest', {
  tsconfig: {
    module: 'commonjs', moduleResolution: 'node', esModuleInterop: true,
    emitDecoratorMetadata: true, experimentalDecorators: true,
    strict: true, skipLibCheck: true,
  },
}];

module.exports = {
  rootDir: '.',
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
      transform: { '^.+\\.ts$': tsJest },
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
      transform: { '^.+\\.ts$': tsJest },
      setupFiles: ['<rootDir>/test/setup.ts'],
      testTimeout: 90000,
    },
    {
      displayName: 'rls',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/rls/**/*.spec.ts'],
      transform: { '^.+\\.ts$': tsJest },
      setupFiles: ['<rootDir>/test/setup.ts'],
      // 90s: os testes de RLS abrem $transaction contra o pooler do Supabase;
      // sob carga, adquirir conexão pode passar de 60s. Falha em 90s é gap
      // de segurança real — investigue, não aumente o timeout.
      testTimeout: 90000,
    },
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/**/*.d.ts',
  ],
  coverageThreshold: { global: { statements: 0, branches: 0, functions: 0, lines: 0 } },
};
```

Scripts em `apps/api/package.json`:

```json
"test": "jest --selectProjects unit --passWithNoTests",
"test:unit": "jest --selectProjects unit --passWithNoTests",
"test:integration": "jest --selectProjects integration --runInBand --forceExit --passWithNoTests",
"test:rls": "jest --selectProjects rls --runInBand --forceExit",
"test:cov": "jest --selectProjects unit integration --coverage --passWithNoTests"
```

> **`test:cov` roda a suíte de integração em paralelo** — só `test:integration`
> e `test:rls` usam `--runInBand`. Consequência prática: fixture compartilhada
> entre suítes de integração precisa ser criada de forma atômica. Semear papéis
> com `role.upsert()` **não** serve: é find-then-create, e duas workers que não
> acham a linha criam as duas — a segunda morre com P2002. Use
> `ensureRole()` de `test/helpers/rls.ts`, que é um
> `INSERT ... ON CONFLICT DO NOTHING`. Encontrado em 2026-09-03, ao acrescentar
> a terceira suíte de integração; as anteriores conviviam com a corrida sem
> nunca perdê-la, e a quarta a fez falhar de verdade. As quatro passam pelo
> helper — se você escrever a quinta, passe também.

`npm run test:rls` continua fazendo exatamente o que fazia. Isso é requisito:
o job `rls` do CI depende dele. **É o único sem `--passWithNoTests`**: ele tem
39 testes e deve falhar alto se eles sumirem. Os outros precisam da flag
enquanto não houver spec — `jest` sai com código 1 em "No tests found", o que
derrubaria o CI já na Fase 0. A Fase 13 remove as flags.

Duas armadilhas confirmadas na execução:

- **`collectCoverageFrom` fica na raiz do config, não dentro dos `projects`.**
  É lido do `globalConfig`. Se você movê-lo para dentro dos projetos, o
  relatório sai `0/0` com os testes passando.
- **Relatório `0/0` também aparece quando nenhum spec rodou.** Não é bug de
  config; o Jest só instrumenta quando há suíte. Com um spec presente, o
  denominador da API é ~4.214 linhas / 820 funções.

### 0.2 web e site

Nenhum dos dois tem runner de unidade. Em **cada** app:

```bash
npm i -D vitest @vitejs/plugin-react jsdom vite-tsconfig-paths \
  @vitest/coverage-v8 @testing-library/react @testing-library/dom \
  @testing-library/jest-dom @testing-library/user-event -w orbien-web
```

`vitest.config.ts` (idêntico nos dois, trocando o nome do app):

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // e2e/ é Playwright — se o Vitest tentar rodar, quebra no import.
    exclude: ['node_modules/**', '.next/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/**/*.d.ts'],
      thresholds: { statements: 0, branches: 0, functions: 0, lines: 0 },
    },
  },
});
```

`vitest.setup.ts`: `import '@testing-library/jest-dom/vitest';`

Rode o comando **duas vezes**, trocando `-w orbien-web` por `-w orbien-site`.

Scripts, nos dois apps:

```json
"test": "vitest run --passWithNoTests",
"test:watch": "vitest",
"test:cov": "vitest run --coverage --passWithNoTests"
```

O `site` tem `playwright` em `devDependencies` **sem config, sem specs e sem
uso** — dependência órfã. Ou vira o smoke da Fase 13, ou sai. Decida na Fase 12.

### 0.3 Turborepo e CI

`turbo.json` já tem a task `test`. O que falta é web e site declararem o
script — hoje `npm test` na raiz resolve só para `orbien-backend` e dá a
falsa impressão de rodar a suíte do monorepo.

No [`ci.yml`](../.github/workflows/ci.yml), acrescentar um job `unit` (sem
banco, rápido, roda em paralelo com `build`) e adicionar o passo de
integração ao job `rls`, que já provisiona o Postgres:

```yaml
  unit:
    name: Unidade e cobertura
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci --include=dev
      - run: npx turbo run test
```

### Pronto quando

```bash
npm ci --include=dev
npx turbo run test          # 3 successful, 3 total
npx turbo run build         # 3 successful, 3 total
npx turbo run lint          # 0 errors
npx tsc --noEmit -p apps/api/tsconfig.json
node scripts/check-skills.mjs
npm run test:cov -w orbien-backend   # imprime relatório de cobertura
```

`npm run test:rls -w orbien-backend` exige banco e não roda na máquina sem
`DATABASE_URL`/`DIRECT_URL`; no CI ele continua verde com os 39 testes. Para
conferir localmente sem banco, `npx jest --selectProjects rls --listTests`
deve listar `test/rls/isolation.spec.ts`.

Em sessão remota (Claude Code on the web/CLI), `.claude/hooks/session-start.sh`
resolve isso sozinho: sobe um Postgres 16 local e efêmero (já vem instalado na
imagem, sem precisar de Docker), roda `bootstrap-db.sh` nele e sobrescreve
`DATABASE_URL`/`DIRECT_URL`/`ORBIEN_APP_PASSWORD` da sessão para apontar pra
esse banco — nunca para o Supabase de produção, mesmo que a sessão já tenha
vindo com as URLs de produção configuradas. Depois disso, `test:integration` e
`test:rls -w orbien-backend` rodam de ponta a ponta sem nenhuma ação manual.
Ver o cabeçalho do hook para o racional completo.

### Verificado na execução

O harness foi validado com specs descartáveis, depois removidos:

- API: `jest --selectProjects unit` descobre spec em `src/`, e a cobertura é
  atribuída ao arquivo real importado.
- web: React 19 renderiza em jsdom com Testing Library, e a cobertura v8
  atribui linha executada ao módulo de origem.
- site: **Server Component renderiza direto** (`render(<Footer />)`, com
  `next/link`), o que confirma a premissa das Fases 10 e 12 — os componentes
  sem `async` são invocáveis como função.

---

## Fases 1–6 — API

Todas seguem o mesmo procedimento. **Leia esta seção uma vez**; as fases
individuais só listam o escopo e o que é específico delas.

### Procedimento

1. Teste de unidade fica **ao lado do arquivo**: `src/financial/dre.service.ts`
   → `src/financial/dre.service.spec.ts`. É o que o projeto `unit` descobre.
2. **Service:** `Test.createTestingModule` com `PrismaService` mockado. O
   padrão da base é *busca no Prisma → cálculo em método privado*, então um
   mock de `findMany`/`aggregate` devolvendo fixture cobre o cálculo inteiro.
3. **`$queryRaw` não se testa com mock.** Onde houver (ex.:
   `financial/forecast.service.ts`, `financial/dashboard.service.ts`), o teste
   vai para `test/integration/` e roda contra o Postgres efêmero, reusando
   `test/helpers/rls.ts` (`prismaAdmin` para fixture, `runAsTenant` para
   contexto de tenant).
4. **Controller:** teste com o service mockado. Assere status, forma da
   resposta, e que o `@Roles` da rota é o esperado (via `Reflector`).
5. **DTO:** `plainToInstance` + `validate` do `class-validator`. Um caso
   válido e um inválido por campo com regra.
6. **Module:** basta um `Test.createTestingModule({ imports: [XModule] })` que
   compila — cobre o arquivo e pega provider mal registrado.
7. Ao terminar, **suba o threshold do caminho** em `coverageThreshold` para
   100 e marque a linha no quadro de Estado. O piso nunca desce.

```js
coverageThreshold: {
  global: { statements: 0, branches: 0, functions: 0, lines: 0 },
  './src/financial/': { statements: 100, branches: 100, functions: 100, lines: 100 },
}
```

### Pronto quando (vale para as fases 1–6)

```bash
npm run test:cov -w orbien-backend
```

sai verde com o caminho da fase em 100% nas quatro métricas, e o CI passa.

---

### Fase 1 — API: financeiro

**Pré-requisito:** Fase 0. **Escopo:** `src/financial/**` (35) + `src/common/**` (2).

É a fase de maior risco do plano: são os números que saem em PDF e em arquivo
SPED. Priorize dentro dela nesta ordem:

1. **`dre.service.ts`** — `groupByCategory` e `previousPeriod`. Casos: receita
   × despesa por categoria; período anterior atravessando virada de ano; mês
   curto (`31/01` → dezembro); filtro por `cost_center`; categoria sem
   transações. O `void isPastor` com o comentário *"no extra redaction needed"*
   vira teste explícito — ou confirma a decisão, ou revela que ela está errada.
2. **`export/sped-export.service.ts`** — layout SPED é **posicional**; um
   off-by-one vira arquivo rejeitado. Use golden file: fixture de transações →
   arquivo esperado, comparação byte a byte.
3. **`recurring-rules/recurring-rule.service.ts`** (369 linhas) — aritmética de
   data. Regra no dia 31 em fevereiro; mês de 30 dias; UTC × local.
4. **`pix.service.ts`** (395 linhas) — maior arquivo do módulo.
5. **`forecast.service.ts`** — `months_of_history === 0` (guarda de divisão por
   zero) e `toYYYYMM` na virada de ano dão para cobrir com mock; o `$queryRaw`
   do histórico vai para `test/integration/`.
6. `export/pdf-export.service.ts` (431), `export/zip-export.service.ts`,
   `export/export.service.ts`, `dre-pdf.service.ts`, `transactions.service.ts`,
   `dashboard.service.ts` (tem `$queryRaw`), `categories.service.ts`,
   `export/jobs.service.ts`.

`src/common/` são os dois interceptors. `tenant-context.interceptor.ts` é
segurança: o teste precisa provar que o `SET LOCAL` sai do **JWT** e não de
nada que o cliente controle. A suíte de RLS prova que o banco isola; este
teste prova que a API manda o tenant certo — são coisas diferentes.

---

### Fase 2 — API: auth e raiz

**Pré-requisito:** Fase 0. **Escopo:** `src/auth/**` (14) + `src/prisma/**` (2)
+ `src/app.controller.ts` + `src/app.module.ts`. (`src/main.ts` fica de fora —
ver Exclusões.)

`auth.service.ts` tem 313 linhas de login, refresh, reset de senha e
impersonate, hoje **sem um único teste**. É a maior superfície de segurança
não coberta depois do RLS.

Dois itens específicos desta fase:

- **`guards/roles.guard.ts` é fail-open por desenho:** sem `@Roles`, libera
  (a autenticação fica com o `JwtAuthGuard`). Isso está correto, mas é frágil.
  Escreva, além do teste da classe, um **teste de invariante** que varre
  `src/**/*.controller.ts` e falha se algum não tiver `@Roles` fora de uma
  allowlist explícita. Hoje 37 dos 40 têm; os 3 sem são legitimamente
  públicos — `app.controller.ts` (health), `waitlist/waitlist.public.controller.ts`
  e `visitor/visitor.public.controller.ts`. Esse teste pega uma classe de
  regressão que nenhum teste de rota individual pegaria.
- **`strategies/jwt.strategy.ts` e `decorators/`** são pequenos e diretos.

---

### Fase 3 — API: pessoas

**Pré-requisito:** Fase 0. **Escopo:** `src/persons/**` (20) +
`src/visitor/**` (7) + `src/waitlist/**` (7).

Destaques: `import/persons-import.service.ts` (352 linhas) — CSV com coluna
faltando, encoding, linha duplicada, telefone inválido, arquivo vazio.
`classification.service.ts` roda **dentro da transação do chamador** (recebe
`tx`), então o mock precisa ser do `PrismaTx`, não do `PrismaService`; cubra o
no-op quando a classificação já é a de destino e o `NotFoundException`.
`demographics.service.ts` é agregação — bom candidato a fixture grande.

`visitor.public.controller.ts` e `waitlist.public.controller.ts` são rotas
**sem autenticação**: teste rate limit (`@nestjs/throttler` está instalado) e
validação de entrada com atenção redobrada.

---

### Fase 4 — API: celebrações

**Pré-requisito:** Fase 0. **Escopo:** `src/celebrations/**` (46). Maior
módulo do projeto.

`celebration-scheduler.service.ts` e `celebration-assignment.service.ts` (371
linhas) concentram a regra de negócio: alocação de voluntário respeitando
indisponibilidade, template aplicado a instância, ministério sem voluntário
disponível. `celebration-instances.service.ts` (318) gera ocorrências a partir
de recorrência — mesma armadilha de data da Fase 1.

Esta é a única área com e2e existente ([`e2e/schedule.spec.ts`](../apps/web/e2e/schedule.spec.ts)
e [`templates.spec.ts`](../apps/web/e2e/templates.spec.ts)). Use os dois como
mapa do comportamento esperado, mas não confie neles como cobertura: são 2
testes e não contam para o número.

---

### Fase 5 — API: voluntários e grupos

**Pré-requisito:** Fase 0. **Escopo:** `src/volunteers/**` (18) +
`src/small-groups/**` (18).

`unavailability.service.ts` alimenta o scheduler da Fase 4 — sobreposição de
intervalos, data única × intervalo, fuso. `volunteer-ministries.service.ts` e
`ministries.service.ts` têm hierarquia de ministério (o web tem
`lib/ministryTree.ts` do outro lado); cubra ciclo e órfão.

---

### Fase 6 — API: conteúdo e apoio — fecha a API

**Pré-requisito:** Fase 0. **Escopo:** `src/content/**` (15) +
`src/settings/**` (4) + `src/study-materials/**` (7) + `src/mail/**` (2) +
`src/storage/**` (2).

`content/scheduler.service.ts` é publicação agendada (`@nestjs/schedule`):
use fake timers. `mail/` (Resend) e `storage/` (S3/R2) são integrações
externas — mocke o SDK, não faça chamada de rede em teste de unidade.

**Ao terminar, a API está em 100%.** Troque as entradas por caminho de
`coverageThreshold` por um único `global` em 100 e apague as parciais.

> **Executado em 2026-09-04:** os 30 arquivos do escopo (`content/`,
> `settings/`, `study-materials/`, `mail/`, `storage/`) fecharam em 100% nas
> quatro métricas — ver as entradas por caminho correspondentes em
> `jest.config.js`. A troca para `global: 100` **não** foi feita: a Fase 1
> (`financial/`) segue com apenas 4 de 35 arquivos testados (linha continua
> `☐` no quadro de Estado), e travar o `global` agora quebraria `test:cov`
> por um motivo alheio a esta fase — `./src/financial/` e `./src/common/`
> nunca tiveram entrada de threshold própria. Decisão fica para quando a
> Fase 1 fechar; a troca é a mesma descrita acima.

---

## Fases 7–10 — web

### Procedimento

1. Teste ao lado do arquivo: `src/lib/phoneMask.ts` → `src/lib/phoneMask.test.ts`.
2. **Componente:** `render` do Testing Library + `user-event`. Assere
   comportamento visível, não implementação.
3. **Busca de dados é `useEffect` + axios** (`src/lib/api.ts`) em todas as
   telas — é o padrão da base, seguir. Mocke o módulo `api` com `vi.mock`, não
   o axios direto: o interceptor mora no `api.ts` e você quer testá-lo uma vez
   só, não em toda tela.
4. `@tanstack/react-query` está no `package.json` mas **não tem provider nem
   uso**. Não introduza nos testes.
5. Suba o threshold do caminho ao terminar a fase.

### Fase 7 — web: lib, hooks, contexts

**Escopo:** `src/lib/` (6), `src/hooks/` (2), `src/contexts/AuthContext.tsx`,
`src/proxy.ts`.

Fase mais barata do plano inteiro e a que mais paga: `phoneMask.ts`,
`ministryTree.ts`, `groupTypes.ts`, `utils.ts` são funções puras. `auth.ts` é
parse e expiração de token. **`api.ts` é a mais importante** — o interceptor de
401/refresh não é verificado por nada hoje, e é ele que quebra a sessão do
usuário quando falha. `useFileUpload.ts` e `AuthContext.tsx` pedem
`renderHook`.

> **Executado em 2026-09-04:** os 10 arquivos do escopo (`lib/api.ts`,
> `lib/auth.ts`, `lib/groupTypes.ts`, `lib/ministryTree.ts`, `lib/phoneMask.ts`,
> `lib/utils.ts`, `hooks/useAuth.ts`, `hooks/useFileUpload.ts`,
> `hooks/useHydrated.ts`, `contexts/AuthContext.tsx`, `proxy.ts` — 11 no total,
> contando os 3 arquivos de `hooks/` que já existiam além dos 2 previstos)
> fecharam em 100% nas quatro métricas — thresholds por caminho em
> `vitest.config.ts`. `useHydrated.ts` precisou de `renderToString` (não só
> `renderHook`) para cobrir o branch de `getServerSnapshot`.
>
> **Achado durante a escrita dos testes, corrigido em seguida:** em
> `lib/api.ts`, o branch "401 sem refresh token" retornava antes do
> `try/finally` que zera `isRefreshing`, então o módulo ficava com
> `isRefreshing=true` permanentemente depois desse caminho — qualquer 401
> seguinte cairia para sempre na fila de retry em vez de tentar de novo, o
> que travaria a sessão do usuário até um reload da página. Fix: o check de
> `refreshToken` entrou para dentro do `try`, então qualquer retorno desse
> branch passa pelo `finally`. `lib/api.test.ts` ganhou um teste de
> regressão que prova que um 401 seguinte volta a acionar o refresh
> normalmente.

**Escopo:** `src/components/ui/` (16), `layout/` (2), `dashboard/` (2),
`providers/theme-provider.tsx`.

Atenção ao contrato documentado no `CLAUDE.md`: `<Button>` é para botão
primário (com `bg-navy` na className); para ícone ou link usa-se `<button>`
puro, porque o `variant` padrão pinta fundo escuro que a className não remove.
**Escreva o teste que fixa esse comportamento** — é exatamente o tipo de coisa
que uma atualização do shadcn quebra em silêncio.

> **Executado em 2026-09-04:** os 21 arquivos do escopo fecharam em 100% nas
> quatro métricas — ver as entradas por caminho em `vitest.config.ts`.
> `layout/` tinha 3 arquivos, não 2 como a tabela contava (`SupportSessionBanner.tsx`
> não estava na contagem original); os três foram cobertos. Em
> `StatusBadge.tsx` o teste do fallback expôs `LABELS[key] ?? classification`
> como ramo morto — `key` só chega vazio para `"visitor"`, nunca para um valor
> fora de `LABELS`, então `?? classification` nunca executava; removido para
> fechar 100% de branch sem teste artificial. Componentes do `@base-ui/react`
> (Modal, Sheet, DropdownMenu, Tooltip, Avatar) renderizam e respondem a
> interação em jsdom via Testing Library; a única armadilha foi
> `DropdownMenuLabel`, que exige estar dentro de `DropdownMenuGroup` — sem
> isso o Base UI lança em runtime, mesmo sem uso desse padrão em código de
> produção ainda. `npx turbo run build --filter=orbien-web` falha em
> `/_not-found` (`TypeError: Cannot read properties of null (reading
> 'useContext')`) — confirmado pré-existente em `main` antes desta fase
> (mesmo erro com o working tree limpo), não investigado por não ser escopo
> desta fase.

### Fase 9 — web: componentes de domínio

**Escopo:** os 28 restantes de `src/components/` — `celebrations/`, `content/`,
`financial/`, `groups/`, `persons/`, `volunteers/`.

São majoritariamente modais e sheets. Padrão por componente: abre, valida
campo obrigatório, submete chamando o service certo, fecha; e o caminho de
erro da API. `ImportCsvModal.tsx` e `MediaUploadField.tsx` envolvem arquivo —
use `File` e `DataTransfer` do jsdom.

> **Executado em 2026-09-04:** os 28 arquivos fecharam em `statements` 99–100%,
> `functions` 100%, `lines` 100% e `branches` 89–98% por diretório — ver as
> entradas em `vitest.config.ts` (`coverage.thresholds`). O que falta de
> `branches`/`statements` é sempre o mesmo padrão: guards `if (!x) return` no
> início de handlers (`handleDeactivate`, `toggleAttendance`,
> `confirmRemoveMaterial` etc.) cujo botão de disparo só existe depois que `x`
> já está preenchido — o ramo "ausente" não é alcançável pela UI real, só
> chamando a função interna direto. Cada teste correspondente documenta o caso
> específico. Duas armadilhas encontradas na execução:
> - **Bug real corrigido:** `GroupTypesModal.tsx`, `CategoriesModal.tsx` e
>   `GroupDetailSheet.tsx` tinham diálogos de confirmação (desativar tipo,
>   excluir categoria, remover material) como `<div>` fixa comum fora de
>   qualquer `Dialog.Root`. Com o modal principal aberto, o Base UI marca
>   *toda* a árvore fora do `Dialog` ativo como `inert` para isolar o foco —
>   incluindo essa div, tornando o botão de confirmar inacessível a leitor de
>   tela e, em navegador real, fisicamente inclicável. Corrigido trocando por
>   um `Dialog.Root` aninhado (mesmo padrão já usado no form de criar/editar).
> - Testar fechar um diálogo aninhado via `{Escape}` é frágil sob execução
>   completa da suíte (falha por ordem/timing mesmo passando isolado); clicar
>   no backdrop (`document.querySelector('.bg-black\\/NN')`) é equivalente e
>   estável.

### Fase 10 — web: rotas — fecha o web

**Escopo:** `src/app/` (14).

11 dos 14 são `'use client'` e renderizam direto no Testing Library. Os 3
restantes — `layout.tsx`, `(admin)/layout.tsx`, `page.tsx` — são Server
Components **sem `async`**, então dá para invocá-los como função e renderizar o
JSX retornado. Se algum virar `async`, o caminho é extrair a parte pura ou
cobrir por integração.

**Ao terminar, o web está em 100%.**

---

## Fases 11–12 — site

O site é **100% estático**: nenhum `fetch`, nenhum `route.ts`, nenhum
`<form>`, nenhuma chamada à API. Os CTAs de waitlist são `href="#waitlist"`
com `TODO: connect to real waitlist action` em 6 arquivos. Isso torna as duas
fases baratas — são testes de renderização — mas também significa que o valor
delas é sobretudo regressão visual e de conteúdo, não de comportamento.

### Fase 11 — site: componentes

**Escopo:** `src/components/` (56) + `src/lib/utils.ts`.

Todos apresentacionais. Teste: renderiza, mostra o texto esperado, links
apontam para o href certo. `layout/NavDropdown.tsx` e `layout/Header.tsx` são
os únicos com interação real.

> **Executado em 2026-09-04:** os 57 arquivos do escopo (56 componentes +
> `lib/utils.ts`) fecharam em **100% nas quatro métricas** — thresholds por
> caminho em `vitest.config.ts`.
>
> **Dois ramos mortos removidos** (mesmo tratamento que a Fase 8 deu ao
> `StatusBadge.tsx`), decisão tomada com o dev depois que os testes os
> expuseram:
> - `ui/Reveal.tsx`: o guard `if (!el) return` protegia um ref que o React
>   sempre preenche antes de o efeito rodar. Virou `ref.current!` com o
>   porquê no comentário.
> - `funcionalidades/financeiro/FinanceiroHero.tsx`: o ternário de `deltaOk`
>   só tinha o ramo positivo nos dados do mockup — o `#C0392B` nunca
>   executava. O campo saiu dos três KPIs e a cor virou literal.
>
> Duas armadilhas encontradas na execução:
> - **`vitest.setup.ts` ganhou um stub de `IntersectionObserver`.** O jsdom
>   não implementa a API, e `ui/Reveal.tsx` instancia uma no mount — sem o
>   stub *qualquer* render de seção quebraria com `ReferenceError`. O stub
>   guarda as instâncias em `intersectionObservers` para o teste do próprio
>   `Reveal` disparar o callback à mão.
> - **`NavDropdown` abre por hover e por clique ao mesmo tempo**, e um
>   clique real de mouse do `user-event` passa antes pelo `onMouseEnter` do
>   wrapper: quando o `onClick` chega, o painel já está aberto e o toggle o
>   fecha de volta. O `skipHover` do `user-event` não muda isso. O teste do
>   caminho sem ponteiro (teclado, toque) usa `fireEvent.click`; o do hover
>   usa `user.hover`/`user.unhover`. Vale registrar que, com mouse, clicar
>   no gatilho hoje fecha o menu que o hover acabou de abrir.
>
> O `playwright` órfão em `devDependencies` continua sem destino — a decisão
> segue marcada para a Fase 12, como o plano previa.

### Fase 12 — site: rotas — fecha o site

**Escopo:** `src/app/` (18).

Todos Server Components sem `async` — invocáveis como função. As duas exceções
são `icon.tsx` e `apple-icon.tsx`, que retornam `ImageResponse`: asserir que
retornam uma resposta com o content-type certo é suficiente, não tente
comparar pixel.

Decida aqui o destino do `playwright` órfão em `devDependencies`: vira o smoke
da Fase 13, ou sai.

> **Executado em 2026-09-04:** os 18 arquivos de `src/app/` fecharam em 100%
> nas quatro métricas — 70 testes em 18 specs, threshold `src/app/**` em
> `vitest.config.ts`. Com a Fase 11 já em `main`, **o site fecha aqui**:
> `npm run test:cov -w orbien-site` dá 100% global nas quatro métricas — 280
> testes em 75 specs, 279 statements, 119 branches, 183 functions, 276 lines.
> (Escrita antes da Fase 11 entrar, esta fase mediu `components/` em ~95% de
> linhas só por arrasto de renderizar as páginas inteiras; a Fase 11 fez o
> trabalho de asserção que o arrasto não faz.)
>
> Duas armadilhas encontradas na execução:
> - **`next/font/google` não funciona fora do build.** O módulo só existe como
>   transformação do compilador do Next; importado pelo Vitest ele não expõe os
>   loaders e `DM_Sans()` estoura com `is not a function`. `layout.test.tsx`
>   mocka o módulo devolvendo `{ variable }`, que é o contrato que o layout usa.
>   `<html>`/`<body>` também não podem ser montados no container do jsdom — o
>   teste renderiza com `renderToStaticMarkup` para asserir os atributos da raiz.
> - **`ImageResponse` precisa do ambiente `node`.** Sob jsdom o Satori gera o
>   SVG normalmente, mas o `sharp` rejeita o `Uint8Array` que vem de outro
>   realm (`Unsupported input ... of type object`). `icon.test.tsx` e
>   `apple-icon.test.tsx` levam `@vitest-environment node` no topo e conferem a
>   assinatura PNG dos primeiros bytes.
>
> A terceira armadilha — `IntersectionObserver`, que o jsdom não implementa e
> `ui/Reveal.tsx` instancia em quase toda seção — foi resolvida em paralelo
> pela Fase 11, e o stub dela é o que ficou: as duas fases escreveram um stub
> cada, e no merge o desta saiu. O da Fase 11 guarda as instâncias em
> `intersectionObservers` para o teste do próprio `Reveal` disparar o callback
> à mão; os testes de rota só precisam que o construtor exista.
>
> **Divergência de conteúdo encontrada, mantida por decisão do dono do
> código:** dos CTAs de lista de espera do site, 8 apontam para
> `href="#waitlist"` e 3 apontam para `href="#"` — `home/FinalCta.tsx`,
> `precos/PrecosCta.tsx` e `contato/ContatoContent.tsx`. `#` rola para o topo e
> não faz nada; `#waitlist` também não faz nada hoje (não existe elemento com
> esse id), mas é a âncora que os outros 8 usam e a que a Fase 13 quer no smoke.
> **Decidido em 2026-09-04: padronizar fica para quando a waitlist existir de
> verdade** — enquanto nenhum dos dois hrefs funciona, unificar seria trocar um
> placeholder por outro. O teste da home fixa o estado atual dos dois casos com
> comentário explícito, então ligar a waitlist faz o teste falhar e cobrar a
> atualização — em vez de passar em silêncio.
>
> **`playwright` órfão: removido.** A dependência era o pacote `playwright`,
> não `@playwright/test`, e não havia `e2e/`, `playwright.config.ts` nem script
> que a usasse no site — ela não sustentava o smoke da Fase 13 como estava.
> Saiu de `apps/site/package.json` nesta fase; se a Fase 13 decidir fazer o
> smoke das 18 rotas, instala `@playwright/test` (que é o runner, como em
> `apps/web`). O `exclude: ["e2e/**"]` do `vitest.config.ts` fica onde está:
> custa nada e já está certo no dia em que existir um `e2e/` no site.

---

## Fase 13 — Fechamento

**Pré-requisito declarado:** fases 1–12. **Cumprido:** 1–9 e 11–12. Falta só a
**Fase 10** (rotas do web), e é ela que divide esta fase em duas metades — a
que não depende dela rodou, a que depende não.

As Fases 11 e 12 entraram na `main` enquanto esta fase era executada (PRs #26 e
#27). Isso destravou metade do item 1: o site foi de 0% a 100% e ganhou o
`global` travado junto com a API. Sobra o web, que a Fase 10 fecha, e o admin,
que não tem fase.

### Estado da Fase 13

| Item | Estado |
|---|---|
| 1. `global: 100` na API | ☑ travado, e verde |
| 1. `global: 100` no site | ☑ travado — destravado pelas Fases 11 e 12 |
| 1. `global: 100` no web e no admin | ☐ falta a Fase 10; o admin não tem fase |
| 2. e2e de financeiro (transação → DRE) | ☑ `apps/web/e2e/financeiro.spec.ts` |
| 2. e2e de pessoas (cadastro e importação) | ◐ cadastro já existia; importação **bloqueada por R2 no CI** |
| 2. e2e de login / redefinir senha | ☑ `apps/web/e2e/login.spec.ts` |
| 3. Smoke do site | ☑ `apps/site/e2e/smoke.spec.ts`, 18 testes |

### 1. Thresholds

**API e site trocaram os thresholds por caminho por `global: 100`** nas quatro
métricas — 18 entradas a menos no `jest.config.js`, 11 a menos no
`vitest.config.ts` do site. Os dois fecham em 100% e, a partir daqui, código
novo sem teste nesses dois apps quebra o CI, que é o ponto da meta.

**No web e no admin o `global` continua em 0, de propósito.** Travá-lo hoje não
seria "a meta cumprida", seria `test:cov` vermelho por trabalho que ainda não
foi feito: web em 68,5% (falta a Fase 10 — as rotas de `src/app/`) e admin em
1,5% (nunca teve fase). Os thresholds por caminho do web seguem valendo como
piso — o piso nunca desce.

Quem fechar a Fase 10 fecha o web do mesmo jeito: troca a lista de caminho de
`apps/web/vitest.config.ts` por `thresholds: { statements: 100, branches: 100,
functions: 100, lines: 100 }`. O comentário no arquivo aponta para cá.

### 2. e2e dos fluxos faltantes

Eram 2 testes quando este plano foi escrito, ambos em escalas. Hoje são **13,
em 8 arquivos** — os três desta fase e mais os que as sessões intermediárias
acrescentaram (conteúdo, grupos, pessoas, suporte).

- **`financeiro.spec.ts`** — lança uma receita pelo modal e confere que ela
  chegou ao DRE, na categoria certa. A asserção é sobre a coluna **Qtd** da
  categoria (inteiro), não sobre o valor formatado: comparar "quantos
  lançamentos esta conta tem" antes e depois não depende de nenhum outro dado
  do tenant, enquanto prender o total em reais faria o teste depender de tudo
  o mais lançado no mês.
- **`pessoas.spec.ts`** — o cadastro já estava coberto. A **importação de CSV**
  foi escrita, rodou, **achou um defeito real** e depois esbarrou em um
  impedimento de ambiente; não ficou no PR. A história inteira está em
  "O que a importação de CSV custou" abaixo, porque é o achado mais caro desta
  fase e o que mais diz sobre o valor de e2e.
- **`login.spec.ts`** — o único fluxo sem sessão, e por isso o único que a
  fixture `page` não serve pronta: cada teste começa limpando os cookies que
  ela semeou. Cobre as três mensagens de erro distintas do login (tenant
  inexistente, senha errada, campo vazio), o login bem-sucedido até o
  dashboard, o pedido de link de redefinição, e a tela de redefinição sem
  token e com token inválido.

**O que não está coberto, e é limite do ambiente:** a troca de senha
concluída. O token só existe no e-mail que a API envia (ou no log do
`MailService` em dev), não há rota que o devolva, e concluir a troca mudaria a
senha da conta de e2e e derrubaria os outros specs. Ficam cobertos os dois
ramos que não dependem do token.

`workers: 1` e `fullyParallel: false` seguem como estavam no web, pelo motivo
original: os specs montam e desmontam dados no mesmo tenant.

### 3. Smoke do site

Decisão que a Fase 12 deixou em aberto — o `playwright` órfão em
`devDependencies` vira o smoke, ou sai: **virou o smoke**, e a dependência foi
trocada por `@playwright/test`, na mesma versão que o web usa. O pacote
`playwright` puro traz só a biblioteca de automação, não o runner, então o
órfão não daria para usar como estava.

`apps/site/playwright.config.ts` tem o mesmo desenho do web (alvo por
`E2E_BASE_URL`, sem subir servidor) menos o `workers: 1`: o site é estático,
nenhum spec cria ou altera dado, então não há estado compartilhado para dois
workers corromperem.

Sobre a contagem: este plano falava em "18 rotas respondem 200". 18 é o número
de **arquivos** em `src/app/`, não de endpoints HTTP — a conta inclui
`layout.tsx`, `globals.css` e o `favicon.ico`, e trata o `not-found` como rota
de 200. Os endpoints reais são **12 páginas navegáveis + 4 gerados** (`icon`,
`apple-icon`, `robots.txt`, `sitemap.xml`), mais o 404. O smoke tem 18 testes
por coincidência de número, não por corresponder à lista antiga.

Cada página é verificada em quatro coisas: responde 200, tem header e footer
(são importados **por página**, não pelo `layout.tsx` — esquecer um deles em
página nova não quebra build nenhum), tem a navegação principal, e traz um
texto próprio dela (sem isso, duas rotas apontando para o mesmo componente
passariam iguais). O 404 é verificado como 404 de verdade: página de erro
servida com 200 é indexada como conteúdo.

### O que a importação de CSV custou

O e2e de importação foi escrito, rodou no CI, e **achou um defeito real de
produto**: `ImportCsvModal.tsx` declarava e lia `columns`, mas a API manda
`detected_columns` (`apps/api/src/persons/dto/import-preview.dto.ts:14`). Com
isso `data.columns` chegava `undefined`, o `for…of` seguinte lançava
`TypeError`, o `catch` do `uploadFile` transformava a exceção na mensagem "Não
foi possível processar o arquivo" — e a importação nunca saía do passo de
upload. **A funcionalidade estava quebrada em produção.**

O detalhe que interessa é *por que ninguém tinha visto*: o modal tem 16 testes
de unidade, todos verdes, e os mocks deles inventavam `columns`. O mock foi
escrito a partir do componente, não do contrato da API, então a suíte
confirmava o próprio erro. É o limite estrutural de teste com mock escrito à
mão, e o argumento concreto a favor de e2e contra a API real.

A correção entrou (modal + os dois mocks). A prova, no nível que dispensa
infraestrutura: com os mocks corrigidos para o contrato real, o componente
**antigo** falha 9 dos 16 testes; o corrigido passa os 16.

**O teste em si não ficou**, e o motivo é ambiente, não desistência.
`POST /persons/import` grava o arquivo temporário no R2 antes de devolver a
prévia (`PersonsImportService.preview` → `StorageService.upload`), e o job de
e2e do CI não configura R2 — decisão registrada em [CI.md](CI.md), que mantém
o pipeline sem segredo externo. Sem `R2_BUCKET_NAME` a rota responde 500
(`No value provided for input HTTP label: Bucket`), e o teste falharia por
infraestrutura ausente, não por regressão — um portão que acusa o que não
deve não é portão.

Para reativá-lo é preciso antes decidir o storage do CI. O caminho de menor
atrito seria um MinIO como service container, mas ele exige tornar o endpoint
do `StorageService` configurável: hoje é fixo em
`https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`. Isso é mudança de produto
e não cabia num PR de testes. Fica registrado como a próxima pergunta, não
como pendência silenciosa.

### Achados desta sessão

Registrados, não corrigidos — não foi o que se pediu, e a regra da casa é que
achado vira pergunta:

1. **`/entrar` no header do site não existe.** `layout/Header.tsx` linha 66
   aponta para `/entrar`; a rota é `/login`. É link morto no header de **todas
   as 13 páginas**. O smoke não o cobre de propósito: um teste que passasse
   com esse link no ar seria teste afrouxado.
2. **A âncora `#waitlist` tem destino na home, e só nela.** Aqui há uma
   divergência com a nota da Fase 12, que registrou "não existe elemento com id
   `waitlist`" e concluiu que a checagem da âncora só faria sentido depois de a
   waitlist ser ligada. **Existe:** `components/home/FinalCta.tsx:8` traz
   `id="waitlist"` e `app/page.tsx:35` renderiza o `FinalCta` na home —
   verificado no estado já mesclado com a Fase 12, e o smoke passa afirmando
   isso. O que aquela nota descreve corretamente é o **resto** do site: os
   `href="#waitlist"` de 6 outros arquivos apontam para um alvo que não existe
   naquelas páginas, e ali o CTA não faz nada. Por isso o smoke afirma a âncora
   só na home, e diz no comentário que é só na home.
3. **`tsc --noEmit` do web tem 1 erro pré-existente**, em
   `src/components/layout/header.test.tsx:29`: o mock de `SessionUser` não tem
   `support_session` nem `support_tenant_name`. Confirmado na baseline sem as
   mudanças desta sessão. Não quebra `turbo run lint`, `test` nem `build` —
   nenhum deles roda `tsc` no web.
### Pronto quando

O que esta fase entrega, e é o que roda verde hoje:

```bash
npx turbo run build                  # 4 successful, 4 total
npx turbo run test                   # 4 successful, 4 total
npx turbo run lint                   # 0 errors
npm run test:cov -w orbien-backend   # 100% nas 4 métricas, com global travado
npm run test:cov -w orbien-site      # 100% nas 4 métricas, com global travado
npm run test:rls -w orbien-backend   # 54 testes verdes
node scripts/check-skills.mjs

# e2e do web, com API e web em pé (é o que o job `E2E` faz)
npm run e2e -w orbien-web            # 12 testes em 8 arquivos, todos verdes

# smoke do site, com o site em pé (job `smoke-site`)
E2E_BASE_URL=http://localhost:3002 npm run e2e -w orbien-site   # 18 verdes
```

Os dois conjuntos de e2e foram rodados de verdade nesta fase, não só listados:
o do web contra API e web locais com o banco semeado (12/12), o do site contra
`next start` (18/18).

O smoke virou portão: job `smoke-site` no `ci.yml`, separado do job de e2e
porque o site não precisa de banco nem de API para ser verificado. Ver
"Fase 3b" em [CI.md](CI.md).

O que **falta** para a meta de 100% nos quatro apps, que era a redação
original desta checklist:

```bash
npm run test:cov -w orbien-web       # hoje 68,5% — falta a Fase 10
npm run test:cov -w orbien-admin     # hoje 1,5%  — não há fase que o cubra
```

A linha do admin foi mantida aqui como registro, não como cobrança: sem uma
fase que produza esses testes, exigir 100% dele nesta checklist era pedir o
resultado sem o trabalho.

---

## Pendências abertas

O primeiro run de CI (PR #1) revelou três pendências que **não** vêm deste
plano e não foram corrigidas por decisão unilateral: RLS sem isolamento por
congregação, lint do `site` quebrado no estado commitado, e e2e dependendo de
dados que o seed não cria. Estão mapeadas com evidência em
[PENDENCIAS.md](PENDENCIAS.md).

A primeira tocava este plano enquanto o job `Testes de RLS` estava vermelho.
**Não está mais**: `npm run test:rls -w orbien-backend` fecha em 54 testes
verdes (o plano falava em 39 — a suíte cresceu desde então). O que impede a
Fase 13 de declarar fechamento hoje não é o RLS, é a Fase 10; ver
"Estado da Fase 13".

## Registro de decisões

**A meta de 100% foi definida pelo dono do projeto.** A objeção usual — que
meta global de percentual induz teste de getter — é conhecida e foi aceita.
A mitigação escolhida foi manter a lista de exclusões mínima e justificada
(três linhas), em vez de excluir categorias inteiras para inflar o número:
`*.module.ts` e `dto/**` ficam **dentro** do denominador de propósito.

**O que ficou fora do denominador e por quê:** cobertura via Playwright.
Instrumentar cobertura através de browser real custa mais do que entrega e faz
o número oscilar por motivo alheio ao código. Os e2e continuam sendo portão de
CI — apenas não entram na conta.

**Ordem das fases é por risco, não por tamanho.** Financeiro primeiro porque
produz números que vão para PDF e SPED; auth em seguida por ser superfície de
segurança sem nenhum teste hoje; site por último porque é estático e não tem
como falhar em runtime. Se o form de waitlist for ligado ao
`waitlist.public.controller` antes da Fase 11, o site sobe de prioridade — é o
primeiro ponto dele que pode compilar e não funcionar.

**Threshold global em vez de lista de caminhos (Fase 13).** A lista por
caminho serviu para subir o piso fase por fase sem travar o CI no meio, e para
isso foi a escolha certa. Mas ela tem um ponto cego que só apareceu no
fechamento: arquivo que nasce **fora** de todos os caminhos listados não é
cobrado por ninguém. Foi o que houve com `src/platform/` — dois DTOs abaixo de
100% sem reprovar nada, em módulo que trata do plano de plataforma. Na API a
lista saiu e o `global` entrou. No site a troca veio junto, assim que as Fases
11 e 12 fecharam. No web e no admin ela fica para quem fechar a Fase 10 e para
quem der ao admin uma fase, porque lá o `global` hoje só produziria CI
vermelho.

**O `playwright` órfão do site virou o smoke da Fase 13**, e não saiu. O que
decidiu foi haver uma afirmação que só browser faz e que importa em site
estático: header e footer são importados por página, não pelo `layout.tsx`, e
página nova sem um deles compila, builda e sobe — só não navega. A dependência
trocou de `playwright` para `@playwright/test`, que é o pacote com o runner.

**`E2E_PASSWORD` em texto no `ci.yml`** vem do seed do repositório e o
[`docs/CI.md`](CI.md) argumenta que não é segredo. Segue válido enquanto o
seed for só de CI. Este plano não muda isso; só registra a dependência.
