-- Contagem de público do culto (PRES). Tabela nova: nasce sem RLS aqui e recebe
-- a policy de congregação em 026_rls_celebration_attendance.sql (fora do
-- histórico do Prisma, aplicado pelo bootstrap-db.sh).
-- AlterTable
ALTER TABLE "ministries" ADD COLUMN "counts_attendance" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "celebration_attendance" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "celebration_instance_id" TEXT NOT NULL,
    "children" INTEGER NOT NULL,
    "members" INTEGER NOT NULL,
    "attendees" INTEGER NOT NULL,
    "visitors" INTEGER NOT NULL,
    "updated_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "celebration_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "celebration_attendance_celebration_instance_id_key" ON "celebration_attendance"("celebration_instance_id");

-- CreateIndex
CREATE INDEX "celebration_attendance_tenant_id_congregation_id_idx" ON "celebration_attendance"("tenant_id", "congregation_id");

-- AddForeignKey
ALTER TABLE "celebration_attendance" ADD CONSTRAINT "celebration_attendance_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "celebration_attendance" ADD CONSTRAINT "celebration_attendance_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "celebration_attendance" ADD CONSTRAINT "celebration_attendance_celebration_instance_id_fkey" FOREIGN KEY ("celebration_instance_id") REFERENCES "celebration_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
