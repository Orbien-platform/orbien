---
name: pull-request
description: Redige título e corpo de Pull Request do monorepo Orbien e, se pedido, abre o PR com gh. Use quando o pedido for texto de PR, descrição de pull request, /pull-request, ou abrir PR depois de implementar algo.
---

# pull-request

Base do PR é sempre `main`. Texto em português.

## Antes de redigir

Leia o diff real, não o que foi planejado:

```bash
git log --oneline main..HEAD
git diff main...HEAD --stat
```

Se o diff tiver mais de ~40 arquivos, leia por app em vez de tudo de uma vez.

## Título

`<tipo>: <resumo curto>` — mesmos tipos das mensagens de commit do repo
(`feat`, `fix`, `chore`, `docs`, `test`). Se houver issue do GitHub, não coloque
o número no título; ele vai no corpo.

## Corpo

Cinco seções, iguais às de `.github/PULL_REQUEST_TEMPLATE.md`. Omita a que não
se aplica em vez de escrever "N/A".

```markdown
## O que muda

Um ou dois parágrafos sobre o comportamento que muda para quem usa o sistema.
Descreva o problema resolvido, não o inventário de arquivos.

## Por que

O motivo, quando não é óbvio pelo título. Se a mudança corrige algo, diga o
que estava quebrado e como se manifestava.

## Como validar

Passos numerados que outra pessoa consegue seguir, terminando no resultado
esperado. Comandos exatos quando houver.

## Revisão

O que foi rodado antes de abrir e o que achou. Se não rodou, diga — é
informação. Não afirme que rodou sem ter rodado.

## Riscos e pendências

O que pode quebrar, o que ficou de fora, o que depende de ação manual
(variável de ambiente nova, migration a aplicar, configuração em Render ou
Vercel). `Nenhum` quando for o caso — não invente risco.
```

Fecha issue do GitHub? Acrescente `Closes #N` ao final.

## Alertas específicos do Orbien

Verifique no diff e mencione em **Riscos e pendências** quando aparecer:

| No diff | Mencionar |
|---|---|
| `apps/api/prisma/migrations/` | migration precisa ser aplicada; se o deploy subir antes, o código diverge do banco |
| `prisma/schema.prisma` sem migration correspondente | schema e banco vão divergir |
| `apps/api/prisma/migrations/001_rls_setup.sql` ou `002_*` | são scripts manuais, fora do histórico do Prisma; não rodam sozinhos |
| Tabela nova | precisa de RLS e policy, mais teste em `test/rls/isolation.spec.ts` |
| `render.yaml`, `vercel.json`, `Dockerfile`, `turbo.json` | configuração de deploy; ver `DEPLOY.md` |
| Variável de ambiente nova | configurar em Render ou Vercel antes do merge |
| `apps/web/e2e/` | como rodar a suíte |
| Rota de API removida ou renomeada | quem consome no front precisa mudar junto |

## Antes de abrir: revisar

O padrão deste repositório é **revisar localmente antes de abrir o PR**, em vez
de depender de revisão automática no CI. Antes do `gh pr create`:

1. `/code-review` — correção genérica: bug, simplificação, eficiência.
2. Skill `pr-review` — as dimensões próprias do Orbien: isolamento
   multi-tenant, sincronia entre migration e código, fronteiras do monorepo,
   convenções do front.

Achado 🚨 se resolve antes de abrir. Se você abrir com um pendente, diga isso em
**Riscos e pendências** — pendência declarada é decisão; pendência silenciosa é
descuido.

## Abrir o PR

Só quando pedido explicitamente — não basta ter pedido o texto.

```bash
git push -u origin HEAD
gh pr create --base main --title "..." --body "$(cat <<'EOF'
...
EOF
)"
```

Sem `gh` autenticado: entregue o corpo e o link
`https://github.com/Orbien-platform/orbien/compare/main...<branch>?expand=1`.

## Não faça

- Não commitar nem alterar o staging para redigir o PR.
- Não afirmar que build, lint ou testes passaram sem ter rodado. Se rodou, cite
  o resultado; se não, diga em **Como validar** o que falta rodar.
- Não incluir conteúdo de `.env`, token ou segredo.
- Não listar arquivos como se fosse o resumo da mudança.
