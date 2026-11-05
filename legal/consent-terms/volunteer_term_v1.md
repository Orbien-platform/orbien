# volunteer_term_v1 — Termo de voluntariado (app, "Meu perfil")

> **[REVISÃO JURÍDICA OBRIGATÓRIA]** Texto provisório, escrito pela equipe de
> produto, que **não** foi revisado por advogado (CONF-01). Não traz cláusula
> de peso legal (vínculo, responsabilidade, seguro, imagem): só diz o que a
> Orbien faz com os dados do voluntário. Mudou o texto, muda a versão
> (`volunteer_term_v2`) — nunca se edita uma versão já aceita
> (`docs/produto/orbien-lgpd-mapping.md`, §3.3).

**Quando aparece:** em Escalas › Meu perfil, no card "Termo de voluntariado".
O aceite é opcional para ver e editar o perfil; ele só registra a ciência.

**Texto exibido:**

> Quero servir como voluntário na minha igreja. Autorizo a igreja a guardar
> minha disponibilidade semanal, meus ministérios e meu histórico de escalas
> para montar e comunicar as escalas de serviço. Posso pedir a revogação deste
> aceite e a correção ou exclusão dos meus dados à igreja a qualquer momento.

**O que é gravado** (`consent_records`, em
`VolunteerProfilesService.acceptTerm`): `version = 'volunteer_term_v1'`,
`origin = 'volunteer_app'`, `consented_at`, IP e user-agent, ligados à `Person`
da conta (`user_accounts.person_id`). Aceitar de novo a mesma versão não grava
outra linha. A revogação é a de `POST /me/revoke-consent` (`version`
`volunteer_term_v1`); a retenção de 5 anos depois da revogação é a do CONF-02.

**Finalidade:** operação da escala de voluntários (mapeamento LGPD, §3.1).
