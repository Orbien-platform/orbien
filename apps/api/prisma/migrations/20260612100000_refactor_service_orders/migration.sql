-- CreateEnum
CREATE TYPE "ResponsibleType" AS ENUM ('person', 'ministry', 'free_text');

-- AlterEnum
ALTER TYPE "CelebrationInstanceStatus" ADD VALUE IF NOT EXISTS 'finalized';

-- DropForeignKey
ALTER TABLE "service_order_items" DROP CONSTRAINT IF EXISTS "service_order_items_responsible_person_id_fkey";

-- DropForeignKey
ALTER TABLE "service_orders" DROP CONSTRAINT IF EXISTS "service_orders_celebration_id_fkey";

-- AlterTable: service_order_items (no existing data, safe to drop/add)
ALTER TABLE "service_order_items"
  DROP COLUMN IF EXISTS "position",
  DROP COLUMN IF EXISTS "responsible_person_id",
  DROP COLUMN IF EXISTS "starts_at",
  ADD COLUMN IF NOT EXISTS "tenant_id" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "congregation_id" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "sequence" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "start_offset_minutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "person_id" TEXT,
  ADD COLUMN IF NOT EXISTS "responsible_type" "ResponsibleType" NOT NULL DEFAULT 'free_text',
  ADD COLUMN IF NOT EXISTS "responsible_label" TEXT,
  ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- Remove defaults used only for the ALTER (no actual rows exist)
ALTER TABLE "service_order_items"
  ALTER COLUMN "tenant_id" DROP DEFAULT,
  ALTER COLUMN "congregation_id" DROP DEFAULT,
  ALTER COLUMN "sequence" DROP DEFAULT,
  ALTER COLUMN "start_offset_minutes" DROP DEFAULT,
  ALTER COLUMN "responsible_type" DROP DEFAULT;

-- Make duration_minutes NOT NULL (was nullable)
ALTER TABLE "service_order_items" ALTER COLUMN "duration_minutes" SET NOT NULL,
  ALTER COLUMN "duration_minutes" SET DEFAULT 0;
ALTER TABLE "service_order_items" ALTER COLUMN "duration_minutes" DROP DEFAULT;

-- AlterTable: service_orders (no existing data, safe to drop/add)
ALTER TABLE "service_orders"
  DROP COLUMN IF EXISTS "celebration_id",
  DROP COLUMN IF EXISTS "is_template",
  ADD COLUMN IF NOT EXISTS "celebration_instance_id" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "title" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMP(3);

ALTER TABLE "service_orders"
  ALTER COLUMN "celebration_instance_id" DROP DEFAULT,
  ALTER COLUMN "title" DROP DEFAULT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "service_order_items_tenant_id_service_order_id_idx"
  ON "service_order_items"("tenant_id", "service_order_id");

-- CreateIndex (unique: 1 service order per celebration instance)
CREATE UNIQUE INDEX IF NOT EXISTS "service_orders_celebration_instance_id_key"
  ON "service_orders"("celebration_instance_id");

-- AddForeignKey
ALTER TABLE "service_orders"
  ADD CONSTRAINT "service_orders_celebration_instance_id_fkey"
  FOREIGN KEY ("celebration_instance_id") REFERENCES "celebration_instances"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_order_items"
  ADD CONSTRAINT "service_order_items_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_order_items"
  ADD CONSTRAINT "service_order_items_congregation_id_fkey"
  FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_order_items"
  ADD CONSTRAINT "service_order_items_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: service_orders
ALTER TABLE "service_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_orders" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "service_orders";
CREATE POLICY tenant_isolation ON "service_orders"
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    tenant_id = app_current_tenant()
    AND congregation_id = app_current_congregation()
  )
  WITH CHECK (
    tenant_id = app_current_tenant()
    AND congregation_id = app_current_congregation()
  );

-- RLS: service_order_items (child — verifica via parent service_order)
ALTER TABLE "service_order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_order_items" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "service_order_items";
CREATE POLICY tenant_isolation ON "service_order_items"
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    tenant_id = app_current_tenant()
    AND congregation_id = app_current_congregation()
  )
  WITH CHECK (
    tenant_id = app_current_tenant()
    AND congregation_id = app_current_congregation()
  );
