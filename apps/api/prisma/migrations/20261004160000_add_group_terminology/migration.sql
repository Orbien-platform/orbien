-- Terminologia da igreja para pequeno grupo (célula, PG, GC, EBD…), PROD-29.
-- Coluna nova em tabela que já tem RLS (`tenant_isolation`, 001, e
-- `orbien_app_auth`, 017): nenhuma policy nova.
ALTER TABLE "branding_configs" ADD COLUMN "group_term_singular" VARCHAR(24),
ADD COLUMN "group_term_plural" VARCHAR(24);

-- Os dois termos andam juntos: ou a igreja definiu singular e plural, ou
-- nenhum (vale o padrão do produto). O Prisma não modela CHECK.
ALTER TABLE "branding_configs"
  ADD CONSTRAINT "branding_configs_group_term_pair_chk"
  CHECK (("group_term_singular" IS NULL) = ("group_term_plural" IS NULL));
