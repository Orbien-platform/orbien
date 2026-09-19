# Ambientes e tenants de teste

Fonte única sobre **onde cada coisa roda** e **sobre qual tenant é permitido
testar**. Decidido em 2026-09-17.

---

## 1. A regra

> **Só `teste1-church` e `teste2-church` podem ser usados para teste.**
> Vale para tudo que é teste — e2e local, e2e no CI, teste manual, validação de
> feature, reprodução de bug, demonstração. Em qualquer ambiente, produção
> inclusive.
>
> **Nenhum outro tenant.** `doca-church` é a igreja do cliente zero: dado dela é
> dado de gente real, e teste que a toca é incidente, não teste.

Não é convenção de estilo, é a única barreira que existe: o RLS isola tenant de
tenant, mas não sabe distinguir "escrita de teste" de "escrita de verdade"
dentro do tenant certo. Quem escolhe o tenant é quem escreve o teste.

Consequência prática: ao criar spec, fixture, script ou seed que escreva
qualquer coisa, o slug é `teste1-church` ou `teste2-church`. Se você se pegar
precisando de dado que só existe em outro tenant, o que falta é seed nos de
teste — não é permissão para usar o outro.

### Quem escolhe o tenant é `E2E_EMAIL`, não `E2E_TENANT`

Esta é a parte que engana, e vale ler duas vezes.

`fixtures.ts` faz o login com **só `{ email, password }`** — sem tenant. O
tenant da sessão sai de `user_accounts.tenant_id` da conta que entrou. Ou seja:
o e-mail é que decide onde tudo será escrito.

`E2E_TENANT` é lido em **um** lugar em toda a suíte — `suporte.spec.ts`, para
escolher em qual tenant a sessão de suporte vai impersonar. Para os outros
specs ele não faz nada.

Então isto **viola a regra**, apesar de parecer correto:

```bash
E2E_TENANT=teste1-church E2E_EMAIL=fvargaspf@gmail.com ...   # escreve no doca-church
```

`fvargaspf@gmail.com` é conta do `doca-church`; a suíte inteira cairia lá. É
por isso que existem contas próprias nos tenants de teste
(`fvargaspf+teste1@gmail.com`, `fvargaspf+teste2@gmail.com`): elas são a única coisa
que de fato aponta a escrita para o tenant certo. Ao revisar um workflow ou um
comando, olhe o **e-mail** — o slug ao lado pode estar certo e mentindo.

**Por que dois.** Um para o fluxo comum e outro para o que precisa de um
segundo tenant na mesma cena: isolamento entre tenants, transferência de conta
(`PATCH /platform/user-accounts/:id/transfer`), listagem de plataforma com mais
de uma linha. Sem o segundo, esses casos empurrariam alguém para um tenant real.

---

## 2. Os ambientes

| Ambiente | Web | Admin | API | Banco |
|---|---|---|---|---|
| Local | `localhost:3001` | `localhost:3002` | `localhost:3000/api` | Postgres local (`scripts/bootstrap-db.sh`) |
| CI | sobe no runner | — | sobe no runner | Postgres 17 efêmero do job |
| Produção | `web.useorbien.com.br` | `admin.useorbien.com.br` | `orbien-api.onrender.com/api` | Supabase |

O domínio é **`.com.br`**. `useorbien.com` (sem `.br`) só aparece no remetente
de e-mail (`MAIL_FROM`), não é endereço de aplicação.

---

## 3. Contas

### Local e CI (seed do repositório)

Criadas por `apps/api/prisma/seed.ts`, senha `A3dodfemf` para todas. **Não são
segredo** e não devem virar secret: só existem em banco descartável, e a senha
está no próprio arquivo versionado.

| Conta | Tenant | Papéis |
|---|---|---|
| `fvargaspf@gmail.com` | `doca-church` | `tenant_admin` + `platform_support` |
| `fvargaspf+teste1@gmail.com` | `teste1-church` | `tenant_admin` |
| `fvargaspf+teste2@gmail.com` | `teste2-church` | `tenant_admin` |
| `fernando.vargas@fill.tech` | `doca-church` | `platform_support` |

`fvargaspf@gmail.com` acumula os dois papéis de propósito: administra a
plataforma inteira **e** é a dona do tenant do cliente zero. O papel é global
por definição (`app_is_platform_support()` não filtra por tenant nem por
congregação) e `rolesForToken()` o mantém no token mesmo quando a atribuição
está em outra congregação. O tenant de origem continua no token porque o
`AuditInterceptor` o grava em `audit_logs.tenant_id`, que é NOT NULL com FK.

`fernando.vargas@fill.tech` é a conta **quebra-vidro**: se o papel da conta
principal cair por engano, o console ainda tem por onde entrar. Ela mora no
`doca-church` porque `user_accounts.tenant_id` é NOT NULL, mas não é conta
operacional da igreja.

**Por que `+teste1` e não `teste1@useorbien.com.br`.** Login trata o e-mail como
identificador, então qualquer string única funcionaria — mas recuperação de
senha e todo e-mail transacional que um teste dispare precisam **chegar em
algum lugar**. Não há caixa em `@useorbien.com.br`; o sub-endereçamento do
Gmail entrega em `fvargaspf@gmail.com`, uma caixa que existe. São contas
distintas para o banco (`user_accounts.email` é único e `+teste1` ≠ `+teste2` ≠
sem sufixo) e a mesma caixa para quem precisa ler. Quando as caixas próprias
existirem, trocar é um `sed` — e aí o motivo desta escolha some junto.

### Produção

Mesmos e-mails de plataforma; as contas dos tenants de teste têm **senha
própria**, sorteada por `scripts/provisionar-tenants-teste.sh` e impressa uma
única vez, já no formato de colar nos secrets (§5). Ninguém inventa senha, e
ela não passa por arquivo, commit nem conversa.

A senha do seed (`A3dodfemf`) **não serve aqui**, mesmo enquanto produção não
estiver em uso oficial: ela está em texto claro num repositório público. O
ambiente sendo novo não é o que a torna segura — é o que torna barato não
começar errado. Uma senha pública numa conta `tenant_admin` de um domínio no ar
continua valendo no dia em que houver cliente atrás dela, e ninguém lembra de
trocá-la nesse dia.

**Conceder `platform_support` em produção é SQL.** Não há rota para isso — o
controller de plataforma cria e edita tenant, lê auditoria e transfere conta,
mas não atribui papel. Quem abre `POST /auth/platform/login` é
`role_assignments`, então a linha entra à mão, com `DIRECT_URL`:

```sql
INSERT INTO role_assignments (id, tenant_id, congregation_id, user_account_id, role_code, updated_at)
SELECT gen_random_uuid()::text, u.tenant_id, u.congregation_id, u.id, 'platform_support', now()
  FROM user_accounts u
 WHERE u.email = 'fvargaspf@gmail.com'
   AND NOT EXISTS (
     SELECT 1 FROM role_assignments r
      WHERE r.user_account_id = u.id AND r.role_code = 'platform_support'
   );
```

Três detalhes que não são estilo:

- **`::text`** — as chaves deste schema são `TEXT`, não `uuid`. O Prisma gera o
  UUID na aplicação (`@default(uuid())`) e a coluna é `TEXT NOT NULL`. Sem o
  cast, o INSERT falha por tipo.
- **`updated_at` explícito** — é `@updatedAt` no Prisma, que a aplicação
  preenche; no banco a coluna é NOT NULL **sem default**. INSERT cru que a
  omite falha.
- **`NOT EXISTS`** — não há unique na tabela, então rodar duas vezes sem ele
  daria duas linhas do mesmo papel.

A congregação vem da própria conta porque `role_assignments.congregation_id` é
NOT NULL — e não restringe nada aqui: `app_is_platform_support()` não filtra por
tenant nem por congregação, e `rolesForToken()` mantém o papel no token vindo de
qualquer uma.

---

## 4. Rodar e2e

Contra o ambiente local (banco semeado, web e API de pé):

```bash
E2E_EMAIL=fvargaspf+teste1@gmail.com E2E_PASSWORD=A3dodfemf E2E_TENANT=teste1-church \
  npm run e2e -w orbien-web
```

Contra produção:

```bash
E2E_BASE_URL=https://web.useorbien.com.br \
E2E_API_URL=https://orbien-api.onrender.com/api \
E2E_EMAIL=... E2E_PASSWORD=... E2E_TENANT=teste1-church \
  npm run e2e -w orbien-web
```

`E2E_API_URL` vai **direto na API**, não em `/api-proxy`: as fixtures montam e
desmontam dados com `fetch()` cru e anexam o Bearer na mão, e o proxy — que
virou Route Handler quando a sessão foi para cookie `HttpOnly` — ignora
`Authorization` de entrada. Só a fixture `page` passa pelo proxy, porque é ela
que navega pelo browser com o cookie semeado.

Rodar contra produção **escreve em produção**: as fixtures criam e removem
celebração, instância e template de verdade, e `suporte.spec.ts` faz login de
plataforma e impersonate, o que grava em `audit_logs`. É aceitável porque o
alvo é um tenant que existe só para isso — e deixa de ser no instante em que
alguém troca o slug.

---

## 5. Secrets do GitHub

O job `e2e-prod` do CI é o único que precisa de secret.

| Secret | Conteúdo |
|---|---|
| `E2E_PROD_EMAIL` | `fvargaspf+teste1@gmail.com` |
| `E2E_PROD_PASSWORD` | a sorteada pelo script de provisionamento (§6) |
| `E2E_PROD_SUPPORT_EMAIL` | `fvargaspf@gmail.com` (tem `platform_support`) |
| `E2E_PROD_SUPPORT_PASSWORD` | senha de plataforma dessa conta |

A conta de `E2E_PROD_EMAIL` **tem que ser a do tenant de teste** — pelo motivo
do §1: é ela que decide onde a suíte escreve. A de `E2E_PROD_SUPPORT_EMAIL` só
precisa ter `platform_support`, e aí qualquer conta de plataforma serve, porque
ela não escreve dado de igreja: entra no console e impersona no tenant que
`E2E_TENANT` aponta.

Em nenhum dos dois casos a senha pode ser a do seed (`A3dodfemf`): ela está em
texto claro num repositório público, e é inofensiva só enquanto vale apenas em
banco descartável.

**O slug do tenant não é secret** e está em texto claro no workflow: `teste1-church`
não é credencial, é o nome público do alvo — e mantê-lo visível é o que permite
ler o YAML e confirmar que o teste não aponta para uma igreja real. Esconder o
slug esconderia justamente o que precisa ser auditável.

Senha e e-mail de produção, ao contrário do seed, **são** credencial: o
repositório é público e essas contas existem num ambiente real.

Secret não chega a PR de fork — por isso `e2e-prod` se pula nesse caso em vez de
falhar vermelho.

---

## 6. Provisionar os tenants de teste em produção

```bash
ORBIEN_API_URL=https://orbien-api.onrender.com/api \
PLATFORM_EMAIL=fvargaspf@gmail.com PLATFORM_PASSWORD=... \
  scripts/provisionar-tenants-teste.sh
```

O script **sorteia as senhas** (`openssl rand -hex 16`, 128 bits) e as imprime
no fim, já rotuladas com o nome do secret correspondente. Passe
`TESTE1_PASSWORD`/`TESTE2_PASSWORD` só se quiser escolher a sua. É a única vez
que elas aparecem — o banco guarda só o hash argon2.

Usa `POST /platform/tenants`, a rota de plataforma — que é atômica: tenant,
plano, branding, congregação e conta admin numa transação só. Não há caminho
por SQL aqui de propósito: o seed roda como `postgres` com BYPASSRLS e só serve
a banco local; em produção o tenant nasce pelo produto, sob RLS, pelo ramo
`app_platform_access()`.

O mesmo resultado sai pelo console (`admin.useorbien.com.br` → Tenants →
"Novo tenant"), que chama exatamente essa rota.

---

## 7. Esvaziar um tenant

```bash
DIRECT_URL=... scripts/limpar-tenant.sh --slug <slug> --manter a@x,b@y   # dry-run
DIRECT_URL=... scripts/limpar-tenant.sh --slug <slug> --manter a@x,b@y --aplicar
```

Preserva tenant, plano, branding, congregações, tipos de grupo, o plano de
contas de sistema e as contas indicadas — com a pessoa, os papéis e a **mesma
senha**. Apaga o resto de tudo que tem `tenant_id`, descoberto do catálogo e
não de lista escrita à mão.

Não tem desfazer. Dry-run primeiro, backup antes do `--aplicar`.
