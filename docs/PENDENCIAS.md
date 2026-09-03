# Pendências abertas

Achados que estão mapeados e **não resolvidos**, com a evidência que os
produziu. Nenhum deles foi corrigido por decisão unilateral — a regra do
`CLAUDE.md` é que achado de portão vira pergunta.

Origem: primeiro run de CI da história do repositório, no
[PR #1](https://github.com/Orbien-platform/orbien/pull/1)
([run 33669099196](https://github.com/Orbien-platform/orbien/actions/runs/33669099196)),
em 2026-09-02. O `ci.yml` estava entre os commits ainda não enviados para a
`main`, então nada disso tinha como aparecer antes.

| # | Pendência | Gravidade | Situação |
|---|---|---|---|
| 1 | RLS não isola por congregação dentro do mesmo tenant | segurança | ✔ **resolvido** — causa era ordem no bootstrap |
| 2 | Lint do `site` quebrado no estado commitado | portão | ✔ resolvido em `chore/harness-ci-e-lint` |
| 3 | E2E depende de dados que o seed não cria | portão | ✔ **resolvido** — seed estendido |

> As três estão fechadas. O diagnóstico original da nº 1 estava incompleto (a
> causa não era policy ausente) e a nº 3 escondia um segundo defeito, mais
> grave. As duas seções abaixo foram reescritas com a causa real.

O job `Unidade e cobertura` passou (53s). Nenhuma destas três é causada pela
Fase 0 do [plano de testes](TESTES.md).

---

## 1. RLS não isolava por congregação — resolvido

**Diagnóstico original estava incompleto.** Ele concluiu que "as políticas de
RLS consideram `tenant_id` e não `congregation_id`". A conclusão é verdadeira
sobre o `001_rls_setup.sql`, e falsa sobre o banco: a migration
`20260608144811_fix_congregation_isolation_policies` faz
`DROP POLICY tenant_isolation` e cria `tenant_congregation_isolation` em 17
tabelas. A policy existe.

### Causa real: ordem no bootstrap

`scripts/bootstrap-db.sh` roda as migrations **antes** do `001_rls_setup.sql`,
porque o `001` precisa das tabelas existindo. Consequência: a migration remove
a policy fraca e cria a forte, e então o `001` recria a fraca por cima.
Policies `PERMISSIVE` se combinam com **OR** — a mais fraca ganha, e o
isolamento por congregação deixa de valer.

Medido em banco recém-provisionado: **15 tabelas** ficavam com as duas
policies, entre elas `persons`. No banco de desenvolvimento, só a forte existe
(o `001` foi aplicado antes da migration, na ordem histórica).

### Segundo defeito, encontrado no caminho

O `001` definia as funções de contexto lendo `app.current_tenant_id`,
`app.current_congregation_id` e `app.current_user_id`. O interceptor da
aplicação escreve `app.tenant_id`, `app.congregation_id` e `app.user_id` — e a
migration `20260608130316_fix_rls_enforcement` já corrigia isso, sendo também
sobrescrita pelo `001`.

Efeito num banco novo: as funções devolviam NULL, **toda** policy negava, e a
API respondia listas vazias sem erro nenhum. Foi o que fez a pendência nº 3
parecer só falta de dado de seed.

Os testes de RLS não pegavam porque `test/helpers/rls.ts` escreve as duas
grafias de chave.

### Correções

1. Passo novo no bootstrap: onde existe `tenant_congregation_isolation`, a
   `tenant_isolation` redundante é removida.
2. Asserção na verificação do bootstrap: se qualquer tabela ficar com as duas,
   falha alto. Testada nos dois sentidos.
3. `001_rls_setup.sql` alinhado às chaves que o interceptor escreve, com
   comentário explicando que divergir faz toda policy negar em silêncio.

### Evidência

Banco provisionado do zero com o bootstrap corrigido:

```
tabelas com as duas policies: 0
persons: tenant_congregation_isolation
Tests: 39 passed, 39 total
```

### Continua em aberto

O teste prova o isolamento no **banco**. Se alguma query da aplicação depende
de filtrar `congregation_id` no código, isso não foi auditado nos services — o
alcance real segue sendo pergunta aberta, ainda que agora o banco isole.

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

## 3. E2E dependia de dados que o seed não criava — resolvido

Os dois specs falhavam por falta de dado, antes de tocar a tela: o seed não
criava celebração nem ministério.

**Mas isso era metade da causa.** Mesmo depois de estender o seed, a API
continuava devolvendo listas vazias — porque o defeito de chaves de contexto
descrito na pendência nº 1 fazia toda policy negar. O dado existia e o RLS o
escondia.

### Correções

- Seed estendido com uma celebração, um ministério e dois voluntários
  vinculados a ele (um líder, um comum).
- Perfil de voluntário para a **conta admin** também: a aba de
  indisponibilidade é visível para qualquer usuário logado, e
  `UnavailabilityService.resolveProfile` responde 404 para quem não tem perfil
  — a tela abria com erro para a própria conta que o e2e usa.
- `docs/CI.md` corrigido: ele afirmava que o seed carregava "ministérios e
  voluntários", o que era falso e foi a premissa que fez o job ser desenhado
  como autocontido.

### Evidência

API e web locais contra banco provisionado do zero, como o job faz:

```
/celebrations           1 item
/volunteers/ministries  1 item
/persons                4 itens
2 passed (5.3s)
```

### Nota histórica

O diagnóstico original propunha duas saídas — estender o seed ou fazer as
fixtures criarem tudo. A primeira foi escolhida: dado de base pertence ao seed,
dado efêmero às fixtures.

<!-- resto do diagnóstico original preservado abaixo -->

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
