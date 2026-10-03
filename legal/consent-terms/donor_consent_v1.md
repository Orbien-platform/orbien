# donor_consent_v1 — Doação avulsa (página pública)

> **Rascunho aguardando revisão jurídica (CONF-01).** O texto abaixo é o que a
> página `/doar/[tenant_slug]` mostra ao lado da caixa de aceite. Mudou o texto,
> muda a versão (`donor_consent_v2`) — nunca se edita uma versão já aceita
> (`docs/produto/orbien-lgpd-mapping.md`, §3.3).

**Quando aparece:** só quando o doador informa um e-mail. Nome sozinho não pede
aceite.

**Texto exibido:**

> Aceito que a igreja use meu e-mail para me enviar o recibo desta doação.
> O e-mail não é usado para outra finalidade, e posso pedir a exclusão dele à
> igreja a qualquer momento.

**O que é gravado quando há aceite** (`pix_payments`): `donor_email`,
`donor_name` (se informado), `donor_consent_version = 'donor_consent_v1'` e
`donor_consented_at`. IP e user-agent **não** são guardados (minimização); a
tabela `consent_records` exige uma `Person`, que a doação pública não cria.

**Finalidade:** emissão do recibo de doação (PROD-03), Premium.
