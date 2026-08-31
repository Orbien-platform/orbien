-- =============================================================================
-- ORBIEN — add_group_meeting_materials
-- GAP-04: vincula StudyMaterial a GroupMeeting com controle de visibilidade
-- (all | leaders_only). RLS padrão B: tenant_id + congregation_id direto na
-- linha (sem lookup ao pai).
-- =============================================================================

-- CreateEnum
CREATE TYPE "MaterialVisibility" AS ENUM ('all', 'leaders_only');

-- CreateTable
CREATE TABLE "group_meeting_materials" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "visibility" "MaterialVisibility" NOT NULL DEFAULT 'all',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_meeting_materials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_meeting_materials_tenant_id_congregation_id_idx" ON "group_meeting_materials"("tenant_id", "congregation_id");

-- CreateIndex
CREATE INDEX "group_meeting_materials_material_id_idx" ON "group_meeting_materials"("material_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_meeting_materials_meeting_id_material_id_key" ON "group_meeting_materials"("meeting_id", "material_id");

-- AddForeignKey
ALTER TABLE "group_meeting_materials" ADD CONSTRAINT "group_meeting_materials_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_meeting_materials" ADD CONSTRAINT "group_meeting_materials_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_meeting_materials" ADD CONSTRAINT "group_meeting_materials_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "group_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_meeting_materials" ADD CONSTRAINT "group_meeting_materials_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "study_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: group_meeting_materials (padrão B — tenant_id + congregation_id)
ALTER TABLE "group_meeting_materials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "group_meeting_materials" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "group_meeting_materials"
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    tenant_id = app_current_tenant()
    AND congregation_id = app_current_congregation()
  )
  WITH CHECK (
    tenant_id = app_current_tenant()
    AND congregation_id = app_current_congregation()
  );
