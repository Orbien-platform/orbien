-- =============================================================================
-- ORBIEN — add_ministry_hierarchy_and_roles (GAP-06)
-- 1. Ministry passa a suportar hierarquia (parent_ministry_id, árvore).
-- 2. VolunteerMinistry troca role_in_ministry (string livre) por um enum
--    (leader | volunteer) + is_primary_leader (bool).
-- =============================================================================

-- ── Ministry hierarchy ───────────────────────────────────────────────────────

ALTER TABLE "ministries" ADD COLUMN "parent_ministry_id" TEXT;

ALTER TABLE "ministries" ADD CONSTRAINT "ministries_parent_ministry_id_fkey"
  FOREIGN KEY ("parent_ministry_id") REFERENCES "ministries"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ministries_parent_ministry_id_idx" ON "ministries"("parent_ministry_id");

-- ── VolunteerMinistry role enum ──────────────────────────────────────────────

CREATE TYPE "VolunteerMinistryRole" AS ENUM ('leader', 'volunteer');

ALTER TABLE "volunteer_ministries" ADD COLUMN "role" "VolunteerMinistryRole" NOT NULL DEFAULT 'volunteer';
ALTER TABLE "volunteer_ministries" ADD COLUMN "is_primary_leader" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: linhas cujo role_in_ministry (texto livre) contém "líder"/"lider"/
-- "leader" (case-insensitive) migram para role='leader'; o resto fica no
-- default 'volunteer'. Inspecionado antes de aplicar: 3 linhas existentes no
-- ambiente de dev, nenhuma batia o padrão de líder (logo, todas ficam
-- 'volunteer' — migração de dado é um no-op funcional aqui, mas a lógica
-- precisa existir para outros ambientes/dados futuros equivalentes).
UPDATE "volunteer_ministries"
SET "role" = 'leader'
WHERE "role_in_ministry" ILIKE '%líder%'
   OR "role_in_ministry" ILIKE '%lider%'
   OR "role_in_ministry" ILIKE '%leader%';

ALTER TABLE "volunteer_ministries" DROP COLUMN "role_in_ministry";

-- ── Reestruturação de dados existentes (tenant doca-church) ──────────────────
-- Hoje existem 3 ministérios sem hierarquia (todos "raiz"), o que viola a nova
-- regra de 1 raiz por tenant/congregação. Reorganiza conforme definido:
--   Pastor Presidente (raiz)
--     ├─ Base Adoração
--     │    └─ Louvor (reparentado)
--     └─ Base Comunhão
--          └─ Recepção (reparentado)
--   Recepção P6 → removido (decisão confirmada; cascade leva a escala
--   "Culto Domingo P6" de 21/06 e a atribuição pendente nela).
DO $$
DECLARE
  v_tenant_id        TEXT := '94638c45-48e6-4b42-8e33-4ae3bb4a2d40';
  v_congregation_id  TEXT := '40956bab-184a-4112-80ae-c0ff748099df';
  v_root_id          TEXT := gen_random_uuid()::text;
  v_adoracao_id      TEXT := gen_random_uuid()::text;
  v_comunhao_id      TEXT := gen_random_uuid()::text;
BEGIN
  INSERT INTO "ministries" (id, tenant_id, congregation_id, name, parent_ministry_id, created_at, updated_at)
  VALUES (v_root_id, v_tenant_id, v_congregation_id, 'Pastor Presidente', NULL, now(), now());

  INSERT INTO "ministries" (id, tenant_id, congregation_id, name, parent_ministry_id, created_at, updated_at)
  VALUES (v_adoracao_id, v_tenant_id, v_congregation_id, 'Base Adoração', v_root_id, now(), now());

  INSERT INTO "ministries" (id, tenant_id, congregation_id, name, parent_ministry_id, created_at, updated_at)
  VALUES (v_comunhao_id, v_tenant_id, v_congregation_id, 'Base Comunhão', v_root_id, now(), now());

  UPDATE "ministries" SET parent_ministry_id = v_adoracao_id
    WHERE name = 'Louvor' AND tenant_id = v_tenant_id AND congregation_id = v_congregation_id;

  UPDATE "ministries" SET parent_ministry_id = v_comunhao_id
    WHERE name = 'Recepção' AND tenant_id = v_tenant_id AND congregation_id = v_congregation_id;

  DELETE FROM "ministries"
    WHERE name = 'Recepção P6' AND tenant_id = v_tenant_id AND congregation_id = v_congregation_id;
END $$;
