# visitor_consent_v1 — Cadastro de visitante (QR público)

> **Rascunho aguardando revisão jurídica (CONF-01).** O texto abaixo é o que a
> página `/visitante/[tenant_slug]/[token]` mostra ao lado da caixa de aceite.
> Mudou o texto, muda a versão (`visitor_consent_v2`) — nunca se edita uma
> versão já aceita (`docs/produto/orbien-lgpd-mapping.md`, §3.3).

**Quando aparece:** sempre. Sem o aceite o cadastro não é enviado — a API
recusa `lgpd_consent` diferente de `true` (`RegisterVisitorDto`).

**Texto exibido** (`{igreja}` é o nome da congregação dona do QR):

> Aceito que a {igreja} guarde meu nome e meus contatos para me receber e falar
> comigo por WhatsApp ou e-mail. Posso pedir a exclusão dos meus dados à igreja
> a qualquer momento.

**O que é gravado** (`consent_records`, em `VisitorService.registerViaQr`):
`version = 'visitor_consent_v1'`, `consented_at`, IP, user-agent e a origem do
QR (`service`, `small_group`, `event`, `other`), ligados à `Person` criada ou
encontrada pelo telefone.

**Finalidade:** acolhimento e contato com o visitante (mapeamento LGPD, §3.1,
"Aceito comunicações + ciência do uso").
