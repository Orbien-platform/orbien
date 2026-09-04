# orbien-admin

Console da plataforma. Roda no subdomínio `admin.` e opera **acima** dos
tenants: listar e criar tenants, ver a waitlist e abrir sessão de suporte
dentro de um tenant no `apps/web`.

Nada aqui é dado de igreja. Toda rota da API que este app consome é uma rota
de plataforma (`@PlatformRoute()` + `@Roles('platform_support')`), e o que as
libera no banco é o ramo `app_platform_access()` das policies — que só é
verdadeiro sem tenant no contexto **e** com `platform_support` em
`role_assignments`.

## Login

`POST /auth/platform/login`, com e-mail e senha — **sem slug de tenant**. Quem
entra aqui administra o ecossistema e não está dentro de nenhum tenant. O
desempate é o papel `platform_support` em `role_assignments`, e o tenant de
origem da conta é resolvido no servidor (o token o carrega porque
`audit_logs.tenant_id` é NOT NULL).

Conta sem o papel recebe o mesmo 401 de senha errada. É intencional.

## Desenvolvimento

```bash
npm run dev:admin   # a partir da raiz do monorepo — porta 3003
```

Precisa da API na 3000 e, para testar a sessão de suporte, do `apps/web` na
3001.

## Variáveis

| Variável | Onde vale | Para quê |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | browser | `/api-proxy` — sempre relativo, sem CORS |
| `API_BACKEND_URL` | **só servidor** | destino do rewrite `/api-proxy/*` |
| `NEXT_PUBLIC_WEB_URL` | browser | origem do `apps/web`, destino da sessão de suporte |

`API_BACKEND_URL` não leva o prefixo `NEXT_PUBLIC_`: ela expõe a URL interna
da API e não deve entrar no bundle do cliente.
