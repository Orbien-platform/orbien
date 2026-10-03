# Doação pública Premium com QR dinâmico — Validation

**Veredito: PASS** (2026-10-03)
**Spec**: `spec.md` · **Diff**: `origin/main..HEAD` na branch `docs/spec-doacao-publica-premium-qr-dinamico`
**Tenants usados em todo teste que grava**: `teste1-church` (Starter) e `teste2-church` (Premium). `doca-church` não foi tocado por nenhum teste (existe só como linha do seed no banco local efêmero).

> **Autor ≠ verificador — ressalva honesta.** O `fillsd` manda um Verifier fresco
> (sub-agente) depois da última tarefa. Não despachei sub-agente porque a regra
> desta sessão é não criá-los sem pedido do usuário; fiz o **fallback standalone**
> da skill: uma passada de olhos frescos contra a `spec.md`, evidence-or-zero, mais o
> sensor de discriminação. É a mesma cabeça que escreveu o código — por isso o sensor
> de mutação abaixo importa mais do que a minha leitura dos testes. Vale uma
> segunda revisão humana ou o `/code-review` antes do merge.

---

## Gates (Build)

| Gate | Comando | Resultado |
| --- | --- | --- |
| Build API | `npm run build` (`apps/api`) | ✅ |
| Lint API | `npm run lint` | ✅ 0 erros |
| Tipos da API incl. `test/` | `scripts/pre-push.sh` | ✅ |
| Unit API | `jest --selectProjects unit` | ✅ **3155 testes / 297 suítes**; `pix.service.ts`, `donation-receipts.service.ts`, controller, guard, scheduler e DTOs novos em **100%** (stmts/branches/funcs/lines). O `global: 100` do jest segue abaixo de 100 por `small-groups.service.ts:639`, que **não é deste diff** (não toquei `small-groups/`) |
| RLS | `npm run test:rls` | ✅ **184 testes / 16 suítes** (inclui 16 novos em `pix-webhook-scope.spec.ts` e `pix-payments.spec.ts`) |
| Integração | `npm run test:integration` | ✅ **138 testes / 20 suítes** (inclui `pix-webhook` 11, `public-donation` 26, `public-intents` 17) |
| Web | `npm run test:cov -w orbien-web` | ✅ exit 0, pisos de cobertura respeitados (99,45 stmts / 97,38 branches) |
| Lint web | `npm run lint -w orbien-web` | ✅ 0 erros (8 warnings **pré-existentes**, nenhum nos arquivos novos) |
| `pre-push.sh` | portão de RLS/monorepo | ✅ **0 bloqueios**, liberado: regras do monorepo, "migration e schema mudaram juntos", tipos, lint, skills, RLS 184/184. **2 alertas** (que o `CLAUDE.md` manda virar pergunta, não silêncio): (1) o build do web cai no crash **conhecido** do Next 16 ao prerenderizar `/_global-error` (AJU-04, vercel/next.js#95741) — não é deste diff, o build da Vercel passa; (2) **o e2e de tela (`--e2e`, Playwright) não rodou** — o diff toca a página `/doar` e o financeiro, só coberta por vitest |

Contagem de testes: nenhum teste foi apagado, pulado ou enfraquecido. As mudanças em
testes **pré-existentes** estão listadas em `tasks.md` §Desvios (harness do
`pix.service.spec.ts`, e o teste da página que envia e-mail, que passou a marcar o
aceite porque o contrato mudou).

## Prova do achado crítico (PEND-16)

`test/integration/pix-webhook.spec.ts` contra o `pix.service.ts` de `origin/main`:
**6 de 10 falham**; com a correção: **11 de 11 passam** (um caso `failed → confirmed`
foi acrescentado depois). Sonda anterior em `pg_policies`/`ROLLBACK`: `orbien_app` sem
contexto lê 0 linhas de `pix_payments`. **Produção não verificada.**

## Sensor de discriminação (mutação)

Cada mutante foi aplicado num arquivo isolado, o teste pertinente rodou, o arquivo
voltou por `git checkout` (árvore limpa antes e depois de cada um). **21/21 mortos.**

| Mutante | Resultado |
| --- | --- |
| M1a Starter passa a abrir cobrança | morto (2 falham) |
| M1b Premium `suspended`/`cancelled` passa a abrir cobrança | morto (2) |
| M2 webhook só confirma `pending` (ignora `failed`) | morto (2) |
| M3 webhook sem `set_config` do escopo | morto (2) |
| M4 baixa manual aceita QR dinâmico | morto (1) |
| M5 status sem filtro de tenant | morto (1) |
| M6 limpeza marca `failed` antes de cancelar | morto (5) |
| M7 teto máximo R$ 500 mil | morto (3) |
| M8 recibo sem checar Premium | morto (4) |
| M9 recibo ignora `is_anonymous` | morto (2) |
| M10 teto de pendentes `>=` → `>` | morto (1) |
| M11 e-mail sem aceite passa no service | morto (1) |
| M12 tracker do throttle ignora o slug | morto (6) |
| W1 backoff do polling sem teto | morto (1) |
| W2 polling ignora aba oculta | morto (1) |
| W3 página ignora o aceite do e-mail | morto (3) |
| W4 mínimo de R$ 5 vira R$ 1 | morto (2) |
| W5 QR vencido/pago não limpa a sessão | morto (2) |
| W6 baixa sem passo de confirmação | morto (8) |
| W7 botão de baixa também para QR dinâmico | morto (1) |
| W8 QR sem fundo branco | morto (1) |

---

## Evidência por AC (`file:line` + asserção)

Caminhos: `S` = `apps/api/src/financial/pix.service.spec.ts`; `I1` =
`apps/api/test/integration/public-donation.spec.ts`; `I2` = `…/pix-webhook.spec.ts`;
`I3` = `…/public-intents.spec.ts`; `R` = `donation-receipts.service.spec.ts`;
`W` = `apps/web/src/app/(public)/doar/[tenant_slug]/page.test.tsx`.

### P0 — webhook sob RLS (DPUB-06)

| AC | Evidência | Resultado esperado pela spec |
| --- | --- | --- |
| Acha a linha de qualquer tenant e roda sob o contexto **da linha** | `I2:114` `confirma o pagamento e cria 1 lançamento…` — `expect(txs[0]).toMatchObject({ tenant_id: t2.tenantId, congregation_id: t2.congregationId, … })`; `S:2110` `fixa app.tenant_id e app.congregation_id com o escopo devolvido, ANTES de ler a linha` — `expect(cap.contexts[0]).toEqual(['tenant-dono','cong-dona'])` | ✅ |
| Contexto vem da função SQL, nunca do payload | `S` (`o contexto vem da função SQL, nunca do payload`) — payload com `tenant_id` forjado, `contexts[0]` continua o do banco | ✅ |
| Token inválido → 401 e nada lido | `I2:197` `token errado é 401 e a linha continua pendente`; `S` (`token com o mesmo tamanho…`, `…de tamanho diferente…`) → `UnauthorizedException` | ✅ |
| Id desconhecido → 200 sem vazar | `I2:189`; `S:2121` `id da Asaas sem escopo: 200, nenhum contexto fixado` | ✅ |
| Função devolve só ids, só a `orbien_app` | `test/rls/pix-webhook-scope.spec.ts` — `Object.keys(rows[0]).sort()` = `['scope_congregation_id','scope_tenant_id']`; `app_user` → `permission denied` | ✅ |

### P1 — QR dinâmico (DPUB-01…05)

| AC | Evidência | Resultado esperado |
| --- | --- | --- |
| Premium ativo → cobra na Asaas, grava linha, responde `dynamic` com `payment_id`/QR/`expires_at` | `S:1182`; `I1:153` — chaves exatas da resposta + `row` com `asaas_payment_id` + `externalReference === row.id` | ✅ |
| Starter → `static`, Asaas intocada | `S:1299`; `I1:253` `toEqual({ mode:'static', pix_key, amount, church_name, transaction_ref })` e `asaas.calls` vazio | ✅ |
| Plano/modo no corpo → 400 | `I1:188` (`plan`,`mode` → 400, sem chamada); `S:1424` (service ignora `plan` forjado) | ✅ |
| Falha da Asaas → chave estática + `provider_unavailable`, linha gravada | `S:1334`; `I1:195` | ✅ |
| Sem `ASAAS_API_KEY` → idem, sem chamar | `S:1322` | ✅ |
| QR falha após cobrança criada → cancela a cobrança | `S:1352`; `I1:215` (`DELETE /payments/pay_int_…`) | ✅ |
| Honeypot inalterado | `S` (`honeypot: nem consulta plano nem fala com a Asaas`) | ✅ |

### P1 — confirmação e lançamento (DPUB-07…10)

| AC | Evidência | Resultado |
| --- | --- | --- |
| Nenhum lançamento antes do webhook | `I1:153` (`txsOf` vazio para a linha); `S` (`a linha nasce no cenário public… nenhum lançamento`) | ✅ |
| `pending → confirmed` + 1 lançamento na categoria da linha, valor do payload | `I2:114`; `S:2747` | ✅ |
| Idempotente: reenvio, `CONFIRMED`+`RECEIVED`, corrida | `I2:140`, `I2:151` (3 entregas paralelas = +1); `S` (`é idempotente…`, `entrega simultânea…`) | ✅ |
| `failed → confirmed` | `I2:165`; `S:1933` | ✅ |
| Descrição "Doação pública via PIX", sem `donor_person_id` | `S:2747` `toMatchObject({ description:'Doação pública via PIX', donor_person_id:null })`; `I1:370` | ✅ |

### P1 — abuso e segurança (DPUB-11…17)

| AC | Evidência | Resultado |
| --- | --- | --- |
| Valor fora de 5–50.000 / 3 casas / NaN → 400 | `create-public-donation.dto.spec.ts` (`it.each` rejeita 4,99; 50.000,01; 10^10; 10,123; `Infinity`; `NaN`; texto); `I1:330` (400, sem linha, sem Asaas) | ✅ |
| Rate limit por igreja + origem | `public-donation-throttler.guard.spec.ts` (balde `slug:ip`, slug cortado em 64, XFF forjado ignorado); `I1:437` (429 numa igreja, outra segue 200) | ✅ |
| Teto de pendentes por tenant | `S:1385` (60 → `cap_reached`), `S` (`um abaixo do teto ainda cobra`); `I1:224` | ✅ |
| 404 uniforme (slug inexistente / sem chave) | `S` `slug sem resposta distinguível` (4 casos); `I1:351` `expect(semChave.body).toEqual(inexistente.body)` | ✅ |
| Sem vazamento entre tenants | `I1:395` (slug de outra igreja com id desta = 404 idêntico); `test/rls/pix-payments.spec.ts`; `I3` (lista e baixa não cruzam igreja nem congregação) | ✅ |
| Status sem PII | `S` (`devolve só status e expires_at`); `I1:370` `Object.keys(antes.body).sort()` = `['expires_at','status']`; `cache-control: no-store` | ✅ |
| RLS: nenhuma policy afrouxada; `USING` ≡ `WITH CHECK` | `test/rls/pix-payments.spec.ts` (`policy.with_check` = `policy.qual`); passo 7 do `bootstrap-db.sh` verifica `pix_webhook_scope` | ✅ |

### P2 — página (DPUB-18…21)

| AC | Evidência | Resultado |
| --- | --- | --- |
| QR, copia-e-cola, valor, validade, chave recolhida | `W` `mostra o QR, o valor, o copia e cola…`; `PixQrBlock.test.tsx` | ✅ |
| Polling → "recebida"; para; limpa sessão | `W` `quando o servidor confirma, troca para 'recebida'…`; `usePaymentStatus.test.tsx` (17 testes, 100%) | ✅ |
| Vencido → "Gerar novo QR" com o mesmo valor | `W` `QR vencido: explica, e 'Gerar novo QR code' volta… MESMO valor` (`toHaveValue("50,00")`) | ✅ |
| 429/rede → recuo sem erro; erro de criação → mensagem | `usePaymentStatus.test.tsx` (`429, 5xx e rede caída recuam 4 → 8 → 16 → 16s`); `W` (`429 vira uma mensagem de espera`, `erro de servidor…`) | ✅ |
| Retomada por `sessionStorage` (com try/catch) | `W` `Retomada do QR` (QR válido volta sem novo POST; vencido/JSON quebrado/estático/sem campos ignorados; storage que lança) | ✅ |

### P2 — dado do doador, aceite, recibo (DPUB-22, 23, 25; 24 descartado)

| AC | Evidência | Resultado |
| --- | --- | --- |
| Colunas `donor_*` gravadas, normalizadas | `S:1446`; `I1:288` (`ana.teste@exemplo.com` minúsculas + `donor_consent_version`) | ✅ |
| E-mail sem aceite → 400 (DTO e service) | `S:1501`; `I1:278` (400 + mensagem + nenhuma linha); `create-public-donation.dto.spec.ts` | ✅ |
| Doador não vai à Asaas, ao log nem à resposta | `I1:315` (`asaas.calls` sem o e-mail); `S` (`a resposta não devolve nome nem e-mail`) | ✅ |
| Formulário exige aceite com e-mail | `W` `aceite do e-mail para o recibo` (6 testes) | ✅ |
| Recibo ao e-mail declarado, sem `Person`; só Premium; anônimo/só nome não | `I1:476` (`person_id: null`, `recipient_email`, `outbox.mails`), `I1:495`, `I1:505`, `I1:514`; `R` (`recibo vai para o e-mail declarado, sem Person…`) | ✅ |
| `Person` vence o declarado; Person sem e-mail não cai para o declarado | `R` (2 testes) | ✅ |
| Webhook repassa o declarado só com e-mail + aceite + cenário público | `S:2530` e os 4 casos negativos vizinhos | ✅ |
| (DPUB-24) retenção | **Descartado** por decisão do dono do produto — nenhum job apaga `donor_*` | n/a |

### P3 — tesouraria (DPUB-26)

| AC | Evidência | Resultado |
| --- | --- | --- |
| Lista as intenções da congregação, paginada, filtro de estado | `I3:144`, `I3:177`, `I3:184`, `I3:191`; `S` (`listPublicIntents`) | ✅ |
| Baixa: `pending/failed → confirmed`, 1 lançamento `manual`, auditoria | `I3:212`; `S:1910`; `I3:286` | ✅ |
| Idempotente (baixas simultâneas) | `I3:234` (3 paralelas + 1 = +1 lançamento) | ✅ |
| QR dinâmico → 409 | `I3:256`; `S:1902` | ✅ |
| Papel sem acesso → 403; sem token → 401; Starter pode | `I3:139`, `I3:204`, `I3:144` | ✅ |
| Aba no web, todos os planos, baixa pede confirmação | `PublicIntentsPanel.test.tsx` (19 testes, 100%); `financeiro/page.test.tsx` (`aba Doações públicas`) | ✅ |

---

## Lacunas conhecidas (ranqueadas)

1. **Hipótese R1 não verificada.** O limite por igreja + origem funciona sob qualquer
   IP que a API enxergue, mas **qual IP chega em `req.ip` pelo `apps/web` na Vercel**
   (e, portanto, se "origem" separa doadores ou os junta) só se resolve em staging.
   Se for o IP de saída do proxy, o balde vira "por igreja" — 30 criações/min —,
   o que ainda protege a Asaas e não bloqueia uma igreja normal.
2. **Produção não verificada para PEND-16.** Vale conferir o log da Render por
   `PixPayment não encontrado` em confirmações reais do Cenário 2 e rodar o
   `bootstrap-db.sh` (`db:deploy`) **antes** do deploy do código (a migration
   `20261003191848` e o `024`).
3. **Efeito do `DELETE /payments/:id` em cobrança paga** não foi confirmado na doc
   (a doc de referência da Asaas estava bloqueada). O job trata qualquer recusa
   como "manter `pending` e logar", então o pior caso é uma linha que fica na fila.
4. **Texto do termo `donor_consent_v1` é rascunho** — precisa da revisão jurídica
   (CONF-01) antes de ir para produção.
5. **Job de limpeza sem teste de integração** (ver `tasks.md` §Desvios).
6. **Resíduo de enumeração:** `POST /financial/pix` (Cenário 1, manual) mantém o 400
   "Igreja não configurou chave PIX" — os testes existentes dele o exigem, então não
   foi alterado sem perguntar. Mesmo caso: ele não tem teto de valor.
