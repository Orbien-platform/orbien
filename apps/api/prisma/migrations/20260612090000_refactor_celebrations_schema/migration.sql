-- CreateEnum
CREATE TYPE "CelebrationInstanceStatus" AS ENUM ('draft', 'published', 'cancelled');

-- AlterEnum
ALTER TYPE "CelebrationRecurrence" ADD VALUE IF NOT EXISTS 'none';

-- AlterEnum: rename CelebrationType values (no existing data, safe to recreate)
BEGIN;
CREATE TYPE "CelebrationType_new" AS ENUM ('sunday_service', 'midweek', 'special_event');
ALTER TABLE "celebrations" ALTER COLUMN "type" TYPE "CelebrationType_new" USING ("type"::text::"CelebrationType_new");
ALTER TYPE "CelebrationType" RENAME TO "CelebrationType_old";
ALTER TYPE "CelebrationType_new" RENAME TO "CelebrationType";
DROP TYPE "CelebrationType_old";
COMMIT;

-- DropIndex
DROP INDEX IF EXISTS "celebration_instances_tenant_id_occurs_at_idx";

-- AlterTable: celebration_instances — rename occurs_at, add status + notes
ALTER TABLE "celebration_instances"
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "scheduled_date" TIMESTAMP(3),
  ADD COLUMN "status" "CelebrationInstanceStatus" NOT NULL DEFAULT 'draft';

-- Copy occurs_at to scheduled_date then drop
UPDATE "celebration_instances" SET "scheduled_date" = "occurs_at";
ALTER TABLE "celebration_instances" ALTER COLUMN "scheduled_date" SET NOT NULL;
ALTER TABLE "celebration_instances" DROP COLUMN "occurs_at";

-- AlterTable: celebrations — rename time, add is_active, make day_of_week nullable
ALTER TABLE "celebrations"
  ADD COLUMN "start_time" TEXT,
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
  ALTER COLUMN "day_of_week" DROP NOT NULL;

-- Copy time to start_time then drop
UPDATE "celebrations" SET "start_time" = "time";
ALTER TABLE "celebrations" ALTER COLUMN "start_time" SET NOT NULL;
ALTER TABLE "celebrations" DROP COLUMN "time";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "celebration_instances_tenant_id_scheduled_date_idx"
  ON "celebration_instances"("tenant_id", "scheduled_date");

-- RLS: celebrations (drop existing policy if any, then recreate)
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
