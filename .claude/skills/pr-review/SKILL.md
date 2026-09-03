---
name: pr-review
description: Revisa mudanças do monorepo Orbien nas dimensões que o code-review embutido não cobre — isolamento multi-tenant, sincronia entre migration e código, fronteiras do monorepo e convenções do front. Serve para a branch local antes de abrir PR (o padrão aqui) ou para um PR já aberto. Use SOMENTE quando pedirem revisão explicitamente ("revisa antes do PR", "revisa o PR #N", "code review"). NÃO acione durante implementação nem em perguntas gerais.
---

# pr-review

## O que esta skill não faz

Correção genérica — bug de lógica, simplificação, eficiência — é o
`/code-review` embutido do Claude Code. **Rode ele primeiro:**

```
/code-review                 # branch local, antes do PR
/code-review <número do PR>  # PR já aberto
```

Esta skill cobre só o que é específico do Orbien e o embutido não conhece.
Não reimplemente o que ele faz.

## Passo 1 — Contexto

**Alvo padrão: a branch local, antes de abrir o PR.** É onde a revisão é mais
útil, porque ainda dá para corrigir sem outro commit.

```bash
git log --oneline main..HEAD
git diff main...HEAD
```

**Alvo alternativo: um PR já aberto** (código de outra pessoa, ou revisão
depois do fato):

```bash
gh pr view <N> --json title,body,headRefName,files
gh pr diff <N> > /tmp/pr-<N>.diff
gh api repos/Orbien-platform/orbien/pulls/<N>/comments --jq '.[] | "\(.path):\(.line)"'
```

O último comando evita repostar comentário onde já existe um (±3 linhas).

## Passo 2 — Escolher as dimensões

**Não lance as três sempre.** Cada subagente custa contexto; lance só o que o
diff justifica:

| Lance esta dimensão | Se o diff toca |
|---|---|
| A — Isolamento e banco | `apps/api/prisma/**`, `apps/api/src/**` |
| B — Monorepo e deploy | `render.yaml`, `vercel.json`, `turbo.json`, `Dockerfile`, `package.json`, `apps/*/package.json`, ou remove/renomeia rota |
| C — Front | `apps/web/src/**`, `apps/site/src/**`, `apps/admin/src/**` |

Diff só de documentação ou só de teste: nenhuma dimensão, e diga isso em vez de
inventar achado.

Lance as dimensões escolhidas em **uma única mensagem**, com uma chamada da
ferramenta Agent para cada.

## Regras comuns a todos os subagentes

1. Comentar só em linha do diff que começa com `+` (não `+++`).
2. Confiança ≥ 80%. Na dúvida, não reporte.
3. Citar o trecho do diff que é a evidência. Sem evidência, sem achado.
4. Nunca aprovar, rejeitar nem alterar arquivo por conta própria. Em PR aberto,
   só `gh pr review <N> --comment`; em branch local, relate no chat e deixe a
   correção para uma decisão explícita.
5. Prefixo do comentário: `<!-- orbien-review:<dimensão> -->`.
6. Severidade: `🚨 crítico` (quebra ou vaza dado), `⚠️ atenção`, `💡 sugestão`.

---

## Dimensão A — Isolamento multi-tenant e banco

A classe de bug mais cara do projeto. Contexto em `docs/MONOREPO.md` e
`apps/api/prisma/migrations/001_rls_setup.sql`.

**Isolamento (🚨 quando violado):**
- Tabela nova sem `tenant_id` e `congregation_id`
- Tabela nova sem `ENABLE ROW LEVEL SECURITY` e sem policy
- Tabela nova sem caso em `apps/api/test/rls/isolation.spec.ts` — as policies
  existirem não prova que isolam
- Query que filtra por tenant só na aplicação, sem depender do RLS
- Uso de `prisma.system` (BYPASSRLS) onde `prisma.client` bastaria

**Sincronia migration ↔ schema ↔ código (🚨):**
Esta é a divergência que já aconteceu em produção: migrations aplicadas à
frente do código publicado deixaram três rotas respondendo 500 por consultarem
tabelas removidas.
- `schema.prisma` alterado sem migration correspondente, ou o inverso
- Migration que dropa tabela ou coluna ainda referenciada em `src/`
- Migration que depende de role ou objeto criado pelos scripts manuais
  (`001_rls_setup.sql`, `002_*.sql`) — eles ficam fora do histórico do Prisma e
  não rodam sozinhos
- `CREATE POLICY` sem `DROP POLICY IF EXISTS` antes: quebra reexecução

## Dimensão B — Fronteiras do monorepo e deploy

Regras em `CLAUDE.md` da raiz; procedimento em `DEPLOY.md`.

- Import cruzando app (`apps/web` importando de `apps/api`, ou o contrário) — 🚨
- `package-lock.json` novo em `apps/*` — a raiz é a única fonte
- Mudança em `apps/api/**` que exige ajuste no Render (build ou start command) —
  o serviço usa **runtime Node**, não Docker
- Variável de ambiente nova sem menção de onde configurar
- Rota de API removida ou renomeada sem o consumidor no front mudar junto
- Endpoint novo sem nenhum consumidor: pode ser código inalcançável — sinalize
  como ⚠️ e pergunte se a tela vem depois
- `buildFilter` do `render.yaml` ou `ignoreCommand` dos `vercel.json` alterados:
  confirme que o isolamento entre apps continua valendo

## Dimensão C — Convenções do front

Regras em `CLAUDE.md` da raiz e `apps/web/AGENTS.md`. Só o que é convenção
desta base — erro genérico de React fica com o `/code-review`.

- `<Button>` usado como botão de ícone ou link sem classe de fundo própria: o
  `variant` padrão pinta `bg-primary` e a className não remove. A base usa
  `<button>` puro nesses casos — ⚠️
- Busca de dados fora do padrão `useEffect` + `axios` de `src/lib/api.ts`
  (`@tanstack/react-query` está instalado mas não tem provider nem uso)
- `Promise.all` para chamadas independentes de tela: uma falha apaga o bloco
  inteiro. O padrão é `allSettled` — ⚠️
- `catch` que mostra estado vazio em vez de erro: faz o usuário achar que não
  há dado quando a chamada falhou — ⚠️
- Botão dentro de botão (HTML inválido)
- Tela nova sem cobertura em `apps/web/e2e/` quando o fluxo é de escrita — 💡

---

## Passo 3 — Consolidar

Você mesmo consolida; não gaste um subagente nisso.

Revisando **branch local**: entregue no chat, e nada mais — não crie arquivo de
relatório.

Feche pedindo a decisão, item a item quando houver mais de um: **seguir assim ou
ajustar antes?** Não corrija por conta própria e não trave o trabalho esperando
resposta perfeita. Seguir com um 🚨 conhecido é escolha legítima do dev; o que
não pode é a pendência passar em silêncio.

Revisando **PR aberto**: poste **um** comentário com `gh pr comment <N> --body`:

```markdown
## Revisão Orbien

Dimensões avaliadas: <A, B, C — e por quê essas>

**Algo bem resolvido:** <uma frase concreta, não elogio genérico>

### 🚨 Crítico (N)
### ⚠️ Atenção (N)
### 💡 Sugestão (N)

Cada item: arquivo:linha — o que é — o que fazer.
```

Se nenhuma dimensão achou nada, diga isso em uma linha. Achado inventado para
parecer útil é pior que revisão vazia.

## Autor ≠ revisor

Se esta revisão roda na mesma sessão que escreveu o código, é o autor
conferindo o próprio trabalho — aplicando o mesmo modelo mental que produziu
qualquer lacuna. É a fraqueza estrutural da revisão local.

Duas formas de mitigar, em ordem de eficácia:

1. Revisar em **sessão nova**, sem o contexto de como o código foi escrito.
2. Despachar as dimensões como **subagentes**, que é o que o Passo 2 manda
   fazer — cada um re-deriva a análise a partir do diff, não da memória.

Nenhuma das duas equivale a outra pessoa revisando. Quando houver a segunda
pessoa no projeto, revisão em PR volta a ser necessária — ver `docs/CI.md`.

## Custo

Uma revisão com as três dimensões consome bem mais contexto que uma com uma. Em
PR pequeno, avaliar você mesmo sem subagente nenhum costuma ser o certo — a
tabela do Passo 2 é o critério, não a vontade de ser exaustivo.
