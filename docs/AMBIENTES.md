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
| Produção | `web.useorbien.com` | `admin.useorbien.com` | `orbien-api.onrender.com/api` | Supabase |

O domínio é **`.com`**, sem `.br` — migração feita em 2026-09-18 (ver
Vercel: `orbien-site`/`orbien-web`/`orbien-admin` têm `useorbien.com` como
domínio de produção). `useorbien.com.br` não existe mais.

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

**Por que `+teste1` e não `teste1@useorbien.com`.** Login trata o e-mail como
identificador, então qualquer string única funcionaria — mas recuperação de
senha e todo e-mail transacional que um teste dispare precisam **chegar em
algum lugar**. Não há caixa em `@useorbien.com`; o sub-endereçamento do
Gmail entrega em `fvargaspf@gmail.com`, uma caixa que existe. São contas
distintas para o banco (`user_accounts.email` é único e `+teste1` ≠ `+teste2` ≠
sem sufixo) e a mesma caixa para quem precisa ler. Quando as caixas próprias
existirem, trocar é um `sed` — e aí o motivo desta escolha some junto.

### Produção

Mesmos e-mails de plataforma. As contas dos tenants de teste usam a senha
pública `orbien-e2e-publica-2026`, criada por
`scripts/provisionar-tenants-teste.sh` e repetida no workflow — o raciocínio
inteiro está no §5.

A senha de plataforma (`fvargaspf@gmail.com` no console) é outra coisa e não
está em lugar nenhum do repositório.

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
E2E_BASE_URL=https://web.useorbien.com \
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

## 5. Credenciais do `e2e-prod` — públicas, de propósito

**Nenhum portão de teste usa secret** — o único secret do CI é o `EXPO_TOKEN`
do build EAS do mobile, que não tem nada com isto. As credenciais do `e2e-prod`
estão em texto claro no workflow:

| Variável | Valor |
|---|---|
| `E2E_EMAIL` | `fvargaspf+teste1@gmail.com` |
| `E2E_PASSWORD` | `orbien-e2e-publica-2026` |
| `E2E_TENANT` | `teste1-church` |

A mesma senha é o padrão de `scripts/provisionar-tenants-teste.sh`. **As duas
pontas têm que casar**: o workflow não consulta nada, ele manda a string no
login — mudar uma sem a outra deixa o job vermelho com `Login falhou: HTTP 401`.

### O contrato que torna isso aceitável

Não é que a senha seja segura. É que **não há o que proteger atrás dela**: a
conta existe só para o e2e, só no `teste1-church`, e um tenant de teste não
guarda dado de ninguém. Quem entrar com ela vê exatamente o que a suíte cria e
apaga.

Isso é um contrato, e vale enquanto for verdade. Se algum dia esta conta ganhar
papel em tenant real, ou o `teste1-church` passar a guardar qualquer coisa que
não seja descartável, a senha sai do repositório **no mesmo commit** — e volta
a ser secret, como estava antes de 2026-09-19.

### O que continua fora do repositório

`E2E_SUPPORT_EMAIL` e `E2E_SUPPORT_PASSWORD` **não** estão no workflow, e a
diferença não é de grau. Aquela é a conta de plataforma: ela entra no console,
lista todos os tenants e impersona em qualquer um. Publicá-la entregaria o
produto inteiro a quem lesse o YAML — não um tenant de teste.

Sem as duas, `suporte.spec.ts` se pula (`test.skip`, não falha). O custo é um
spec a menos contra produção, e é o custo certo. Para rodar esse spec, passe as
variáveis no ambiente ao chamar a suíte na mão.

**A senha do seed (`A3dodfemf`) também não serve aqui.** Não por sigilo — ela é
igualmente pública — mas porque é a senha de `fvargaspf@gmail.com`, que em
produção é `tenant_admin` do `doca-church` **e** `platform_support`. Reusá-la
nas contas de teste convida ao caminho inverso: alguém provisionar a conta real
com ela por hábito.

**O slug não é credencial** e está visível de propósito: é o que permite ler o
YAML e confirmar que o teste não aponta para uma igreja real.

Secret não chega a PR de fork — por isso `e2e-prod` se pula nesse caso em vez de
falhar vermelho.

---

## 6. Provisionar os tenants de teste em produção

São dois caminhos para o mesmo fim. **O SQL é o mais curto**, e é o que foi
usado da primeira vez:

**a) SQL, no editor do Supabase** — `scripts/sql/provisionar-tenants-teste.sql`.
Cole e rode. Idempotente, numa transação só, e já inclui o `platform_support`
de `fvargaspf@gmail.com`. Roda como superusuário, passando por cima do RLS —
mesmo caminho do seed.

O `password_hash` é **argon2id** e o Postgres não sabe gerá-lo (o `pgcrypto`
só tem bcrypt). Por isso o hash está pronto dentro do arquivo, calculado com a
mesma biblioteca que a API usa para conferir. Trocar a senha exige recalcular:

```bash
node -e "require('argon2').hash('SUA-SENHA').then(console.log)"
```

**b) Pela rota de plataforma** — `scripts/provisionar-tenants-teste.sh`:

```bash
ORBIEN_API_URL=https://orbien-api.onrender.com/api \
PLATFORM_EMAIL=fvargaspf@gmail.com PLATFORM_PASSWORD=... \
  scripts/provisionar-tenants-teste.sh
```

Exige um token de `platform_support` — que só existe depois que o papel foi
concedido, o que por sua vez é SQL. Daí o caminho (a) ser o primeiro.

As contas nascem com `orbien-e2e-publica-2026`, a mesma senha que o workflow
manda no login (§5). Passe `TESTE1_PASSWORD`/`TESTE2_PASSWORD` só se quiser
outra — e então ajuste o workflow no mesmo commit, senão o `e2e-prod` quebra
no 401.

Usa `POST /platform/tenants`, a rota de plataforma — que é atômica: tenant,
plano, branding, congregação e conta admin numa transação só. Não há caminho
por SQL aqui de propósito: o seed roda como `postgres` com BYPASSRLS e só serve
a banco local; em produção o tenant nasce pelo produto, sob RLS, pelo ramo
`app_platform_access()`.

O mesmo resultado sai pelo console (`admin.useorbien.com` → Tenants →
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
