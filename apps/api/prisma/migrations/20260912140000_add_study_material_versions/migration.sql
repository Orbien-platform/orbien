-- =============================================================================
-- ORBIEN — add_study_material_versions
-- PROD-10: histórico de versões de materiais de estudo. Snapshot do
-- StudyMaterial capturado antes de cada PATCH. RLS padrão B: tenant_id +
-- congregation_id direto na linha (sem lookup ao pai).
-- =============================================================================

-- CreateTable
CREATE TABLE "study_material_versions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "study_material_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "author" TEXT,
    "source_type" "StudyMaterialSource" NOT NULL,
    "file_url" TEXT,
    "rich_content" TEXT,
    "publish_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "tags" TEXT[],
    "changed_by_user_id" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_material_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "study_material_versions_tenant_id_congregation_id_idx" ON "study_material_versions"("tenant_id", "congregation_id");

-- CreateIndex
CREATE INDEX "study_material_versions_study_material_id_idx" ON "study_material_versions"("study_material_id");

-- CreateIndex
CREATE UNIQUE INDEX "study_material_versions_study_material_id_version_key" ON "study_material_versions"("study_material_id", "version");

-- AddForeignKey
ALTER TABLE "study_material_versions" ADD CONSTRAINT "study_material_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_material_versions" ADD CONSTRAINT "study_material_versions_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_material_versions" ADD CONSTRAINT "study_material_versions_study_material_id_fkey" FOREIGN KEY ("study_material_id") REFERENCES "study_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_material_versions" ADD CONSTRAINT "study_material_versions_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS: study_material_versions (padrão B — tenant_id + congregation_id)
ALTER TABLE "study_material_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "study_material_versions" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "study_material_versions"
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    tenant_id = app_current_tenant()
    AND congregation_id = app_current_congregation()
  )
  WITH CHECK (
    tenant_id = app_current_tenant()
    AND congregation_id = app_current_congregation()
  );
