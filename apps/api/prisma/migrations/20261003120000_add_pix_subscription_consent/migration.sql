-- PROD-28 (PIX recorrente contratado pelo próprio doador, atrás da trava
-- `ASAAS_PAYMENTS_ENABLED`). Aceite versionado de quem contratou, e no máximo
-- uma assinatura ativa **contratada pelo próprio doador**: é o que segura o
-- toque duplo e o reenvio de `POST /me/pix-subscriptions` sem criar duas
-- cobranças mensais.
--
-- Só as do doador (`consent_version IS NOT NULL`), não as do tesoureiro: o
-- tesoureiro nunca teve esse limite (dízimo + oferta missionária para a mesma
-- pessoa é legítimo), e um índice sobre todas as linhas faria este deploy
-- falhar se produção já tivesse duas ativas para alguém.
--
-- Sem RLS nova: são colunas e um índice de `pix_subscriptions`, que já tem a
-- `tenant_congregation_isolation` simétrica de 023_rls_pix_subscriptions.sql.

ALTER TABLE "pix_subscriptions" ADD COLUMN "consent_version" TEXT;
ALTER TABLE "pix_subscriptions" ADD COLUMN "consent_accepted_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "pix_subscriptions_one_active_per_donor"
  ON "pix_subscriptions" ("tenant_id", "donor_person_id")
  WHERE "status" = 'active' AND "consent_version" IS NOT NULL;
