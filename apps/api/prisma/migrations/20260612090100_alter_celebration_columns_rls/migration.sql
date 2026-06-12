-- Enums já aplicados na migration anterior (enums são DDL não-transacionais no Postgres).
-- Esta migration aplica apenas as alterações de colunas e RLS.

-- DropIndex (occurs_at)
DROP INDEX IF EXISTS "celebration_instances_tenant_id_occurs_at_idx";

-- AlterTable: celebration_instances
ALTER TABLE "celebration_instances"
  ADD COLUMN IF NOT EXISTS "notes" TEXT,
  ADD COLUMN IF NOT EXISTS "scheduled_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "status" "CelebrationInstanceStatus" NOT NULL DEFAULT 'draft';

UPDATE "celebration_instances" SET "scheduled_date" = "occurs_at" WHERE "scheduled_date" IS NULL;
ALTER TABLE "celebration_instances" ALTER COLUMN "scheduled_date" SET NOT NULL;

-- Only drop occurs_at if it still exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'celebration_instances' AND column_name = 'occurs_at'
  ) THEN
    ALTER TABLE "celebration_instances" DROP COLUMN "occurs_at";
  END IF;
END $$;

-- AlterTable: celebrations
ALTER TABLE "celebrations"
  ADD COLUMN IF NOT EXISTS "start_time" TEXT,
  ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true,
  ALTER COLUMN "day_of_week" DROP NOT NULL;

UPDATE "celebrations" SET "start_time" = "time" WHERE "start_time" IS NULL;
ALTER TABLE "celebrations" ALTER COLUMN "start_time" SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'celebrations' AND column_name = 'time'
  ) THEN
    ALTER TABLE "celebrations" DROP COLUMN "time";
  END IF;
END $$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "celebration_instances_tenant_id_scheduled_date_idx"
  ON "celebration_instances"("tenant_id", "scheduled_date");

-- RLS: celebrations
ALTER TABLE "celebrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "celebrations" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "celebrations";
CREATE POLICY tenant_isolation ON "celebrations"
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    tenant_id = app_current_tenant()
    AND congregation_id = app_current_congregation()
  )
  WITH CHECK (
    tenant_id = app_current_tenant()
    AND congregation_id = app_current_congregation()
  );

-- RLS: celebration_instances
ALTER TABLE "celebration_instances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "celebration_instances" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "celebration_instances";
CREATE POLICY tenant_isolation ON "celebration_instances"
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    tenant_id = app_current_tenant()
    AND congregation_id = app_current_congregation()
  )
  WITH CHECK (
    tenant_id = app_current_tenant()
    AND congregation_id = app_current_congregation()
  );
