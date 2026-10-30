-- Dado de saúde da criança (kids T12): tabela 1:1 própria, isolada de persons.
-- Nasce sem RLS aqui; a policy de congregação vem em 030_rls_kids_child_health.sql.
-- CreateTable
CREATE TABLE "kids_child_health" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "allergies" TEXT,
    "medical_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kids_child_health_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kids_child_health_person_id_key" ON "kids_child_health"("person_id");

-- CreateIndex
CREATE INDEX "kids_child_health_tenant_id_congregation_id_idx" ON "kids_child_health"("tenant_id", "congregation_id");

-- AddForeignKey
ALTER TABLE "kids_child_health" ADD CONSTRAINT "kids_child_health_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kids_child_health" ADD CONSTRAINT "kids_child_health_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kids_child_health" ADD CONSTRAINT "kids_child_health_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

