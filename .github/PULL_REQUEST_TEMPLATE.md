## O que muda

<!-- O comportamento que muda para quem usa o sistema. O problema resolvido,
     não o inventário de arquivos. -->

## Por que

<!-- O motivo, quando não é óbvio pelo título. Se corrige algo, diga o que
     estava quebrado e como se manifestava. Remova a seção se o título basta. -->

## Como validar

<!-- Passos numerados que outra pessoa consegue seguir, terminando no
     resultado esperado. Comandos exatos quando houver. -->

## Revisão

<!-- O padrão aqui é revisar localmente antes de abrir o PR: /code-review para
     correção genérica, e a skill pr-review para as dimensões do Orbien
     (isolamento multi-tenant, sincronia migration↔código, fronteiras do
     monorepo, convenções do front). Diga o que rodou e o que achou.
     Se não rodou, diga isso — é informação, não vergonha. -->

## Riscos e pendências

<!-- O que pode quebrar, o que ficou de fora, o que depende de ação manual.
     "Nenhum" quando for o caso — não invente risco.

     Vale mencionar quando o diff toca:
     - prisma/migrations/  → migration a aplicar; se o deploy subir antes, o
                             código diverge do banco
     - tabela nova         → precisa de RLS, policy e caso em
                             apps/api/test/rls/isolation.spec.ts
     - 001_rls_setup.sql, 002_*  → scripts manuais, fora do histórico do
                             Prisma; não rodam sozinhos
     - render.yaml, vercel.json, turbo.json, Dockerfile  → ver DEPLOY.md
     - variável de ambiente nova  → configurar em Render ou Vercel antes do merge
     - rota de API removida/renomeada  → o consumidor no front muda junto -->
