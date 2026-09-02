# Pendências abertas

Achados que estão mapeados e **não resolvidos**, com a evidência que os
produziu. Nenhum deles foi corrigido por decisão unilateral — a regra do
`CLAUDE.md` é que achado de portão vira pergunta.

Origem: primeiro run de CI da história do repositório, no
[PR #1](https://github.com/Orbien-platform/orbien/pull/1)
([run 33669099196](https://github.com/Orbien-platform/orbien/actions/runs/33669099196)),
em 2026-09-02. O `ci.yml` estava entre os commits ainda não enviados para a
`main`, então nada disso tinha como aparecer antes.

| # | Pendência | Gravidade | Job |
|---|---|---|---|
| 1 | RLS não isola por congregação dentro do mesmo tenant | segurança | Testes de RLS |
| 2 | Lint do `site` quebrado no estado commitado | portão | ✔ resolvido em `chore/harness-ci-e-lint` |
| 3 | E2E depende de dados que o seed não cria | portão | E2E |

O job `Unidade e cobertura` passou (53s). Nenhuma destas três é causada pela
Fase 0 do [plano de testes](TESTES.md).

---

## 1. RLS não isola por congregação dentro do mesmo tenant

**Gravidade: segurança.** É a única das três que não é problema de
encanamento de CI.

### Evidência

`npm run test:rls -w orbien-backend` — **37 de 39 testes passam**. Os dois que
falham são a seção 4 de
[`test/rls/isolation.spec.ts`](../apps/api/test/rls/isolation.spec.ts):

```
● 4. Cross-congregation read (same tenant)
  › Congregation A-Main context cannot see Congregation A-Second persons
● 4. Cross-congregation read (same tenant)
  › app_user role: Congregation A-Main cannot see Congregation A-Second persons

    Expected: 0
    Received: 1
```

Uma pessoa da congregação A-Second é visível a partir do contexto da A-Main,
dentro do mesmo tenant.

### Leitura do resultado

Isolamento **entre tenants** está íntegro: os outros 37 testes cobrem leitura,
INSERT com `WITH CHECK`, tampering de `tenant_id` e privacidade de doador em
20 tabelas, e todos passam. O que falha é só a fronteira **entre congregações**.

As **duas** variantes falharam — `runAsTenant` e `runAsTenantWithRole`. Pelo
critério escrito no cabeçalho do próprio spec, falhar nas duas significa que
não é contexto mal aplicado: as políticas de RLS consideram `tenant_id` e não
`congregation_id`.

### O que este teste não prova

Ele prova que o **banco** não isola por congregação. Se isso chega ao usuário
final depende de todas as queries da aplicação filtrarem `congregation_id` no
código — o que não foi auditado nos 48 services. O alcance real é a pergunta
em aberto, não o achado em si.

### Em aberto

Três saídas, e a escolha é de produto tanto quanto de engenharia:

1. **Isolamento por congregação é requisito** → as policies precisam de
   `app_current_congregation()`, e o `SET LOCAL` já existe para alimentá-las
   (`tenant-context.interceptor.ts` define `app.congregation_id`).
2. **Congregações do mesmo tenant devem mesmo se enxergar** → o teste está
   errado, e a seção 4 deve ser reescrita para afirmar o contrário. Note que
   existe um teste de controle positivo (seção 21) justamente para impedir que
   a suíte passe por vacuidade; reescrever a 4 não afeta os outros 37.
3. **Aceitar como limitação conhecida** → registrar aqui e no `DEPLOY.md`,
   com a ressalva de que o gate de CI fica vermelho até alguém decidir.

Enquanto não houver decisão, **não ajuste a asserção para o teste passar** —
é o que o cabeçalho do spec pede explicitamente.

---

## 2. Lint do `site` quebrado no estado commitado

**Resolvido** em `chore/harness-ci-e-lint`, commit `c84fc02` — *"fix(web,site):
zera os erros de lint sem alterar regra nem comportamento"*, 20 arquivos. Fica
registrado aqui porque o diagnóstico explica por que o portão passava na
máquina e falhava no CI, e porque a correção **não** está na branch do PR #1:
até `chore/harness-ci-e-lint` ser mergeada, o job `Build, tipos e lint` do PR
#1 continua vermelho por este motivo.

### Evidência

```
✖ 12 problems (10 errors, 2 warnings)
```

Seis arquivos, todos em `apps/site/src/`:

- `app/login/page.tsx` — `Link` importado e não usado
- `components/funcionalidades/conteudos/ConteudosHero.tsx`
- `components/home/Credibility.tsx`
- `components/lgpd/LgpdContent.tsx`
- `components/precos/FeatureCompare.tsx`
- `components/sobre/EstagioAtual.tsx`

O grosso é `react/no-unescaped-entities`: aspas literais em JSX que precisam
virar `&quot;`.

### Por que passa na máquina e falha no CI

Os seis arquivos estão modificados no working tree local **sem commit**, e as
modificações são exatamente a correção. Exemplo, em `Credibility.tsx`:

```diff
-<span style={{ color: "var(--navy-accent)", fontWeight: 600 }}>"</span>
+<span style={{ color: "var(--navy-accent)", fontWeight: 600 }}>&quot;</span>
```

`npx turbo run lint` na máquina lê o working tree e passa; o CI lê o commit e
falha. Não é divergência de configuração de eslint entre os ambientes.

### O que restou

Nada a decidir sobre o conteúdo. Resta só a ordem de merge: `chore/harness-ci-e-lint`
precisa entrar antes, ou o PR #1 precisa rebasear em cima dela, para o job
ficar verde.

---

## 3. E2E depende de dados que o seed não cria

**Gravidade: portão.** Os 2 testes e2e falharam, os dois por falta de dado —
não por regressão de UI.

### Evidência

[`e2e/schedule.spec.ts`](../apps/web/e2e/schedule.spec.ts), falha em 296 ms
(antes de tocar a tela):

```
Error: Nenhuma celebração cadastrada — impossível criar instância de teste.
  at e2e/fixtures.ts:288
```

[`e2e/templates.spec.ts`](../apps/web/e2e/templates.spec.ts), falha após 30 s
de espera:

```
Error: select de ministérios não foi preenchido
  Locator: getByLabel('Ministério 1').locator('option').nth(1)
  at e2e/templates.spec.ts:50
```

### Causa

[`prisma/seed.ts`](../apps/api/prisma/seed.ts) cria: `groupType`, `tenant`,
`tenantPlan`, `brandingConfig`, `congregation`, `role`, dois `userAccount`,
uma `person`, `roleAssignment` e categorias financeiras.

**Não cria celebração nem ministério** — que é precisamente o que os dois
specs precisam.

Os testes presumivelmente passam contra o Supabase de desenvolvimento, que tem
dados reais acumulados. Contra um banco provisionado do zero, não têm de onde
partir.

### Nota sobre a documentação

[`docs/CI.md`](CI.md) afirma que o seed "carrega usuário, tenant, **ministérios
e voluntários**" e descreve a fase de e2e como "autocontida". As duas
afirmações não conferem com o `seed.ts` atual. Quem for mexer nesta pendência
deve corrigir o `CI.md` junto — a premissa errada é o que fez o job ser
desenhado assim.

### Em aberto

Duas saídas:

1. **Estender o seed** com uma celebração e ao menos um ministério com
   voluntário. Torna o e2e de fato autocontido, que era a intenção declarada.
   Custo: o seed passa a carregar dado de teste, o que é aceitável enquanto
   ele for só de CI e desenvolvimento.
2. **Os specs criarem o próprio fixture** via API antes de rodar. Mais
   isolado, mais lento, e `fixtures.ts` já faz metade disso — o
   `upcomingInstance` cria a instância, só não cria a celebração de base.

A opção 1 é a menor mudança; a 2 é a mais robusta. Nenhuma foi escolhida.

---

## Registro

Ao resolver uma pendência, remova a seção e registre no commit o que foi
decidido — inclusive quando a decisão for aceitar o comportamento atual.
