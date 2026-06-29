-- =============================================================================
-- ORBIEN — add_group_types (GAP-08)
-- Tipos de pequeno grupo deixam de ser um enum fixo (SmallGroupType) e passam
-- a ser configuráveis por tenant/congregação via tabela group_types.
-- =============================================================================

-- Sem dados relevantes em small_groups no ambiente atual (confirmado) — limpa
-- antes de tornar group_type_id NOT NULL sem default. Cascateia para
-- group_memberships, group_meetings, prayer_requests, material_targets e
-- group_meeting_materials (via group_meetings); apenas nulifica
-- role_assignments.small_group_id e visit_records.small_group_id (ON DELETE
-- SET NULL nesses dois).
DELETE FROM "small_groups";

-- CreateTable
CREATE TABLE "group_types" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_types_tenant_id_congregation_id_idx" ON "group_types"("tenant_id", "congregation_id");

-- AddForeignKey
ALTER TABLE "group_types" ADD CONSTRAINT "group_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_types" ADD CONSTRAINT "group_types_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: small_groups.type (enum) → small_groups.group_type_id (FK)
ALTER TABLE "small_groups" DROP COLUMN "type",
ADD COLUMN     "group_type_id" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "small_groups_group_type_id_idx" ON "small_groups"("group_type_id");

-- AddForeignKey
ALTER TABLE "small_groups" ADD CONSTRAINT "small_groups_group_type_id_fkey" FOREIGN KEY ("group_type_id") REFERENCES "group_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropEnum
DROP TYPE "SmallGroupType";

-- RLS: group_types (padrão B — tenant_id + congregation_id, sem exceção de
-- leitura cross-congregation; segue o precedente de group_meeting_materials)
ALTER TABLE "group_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "group_types" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "group_types"
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    tenant_id = app_current_tenant()
    AND congregation_id = app_current_congregation()
  )
  WITH CHECK (
    tenant_id = app_current_tenant()
    AND congregation_id = app_current_congregation()
  );
