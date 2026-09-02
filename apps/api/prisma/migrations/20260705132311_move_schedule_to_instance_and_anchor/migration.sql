-- DropForeignKey
ALTER TABLE "celebration_schedules" DROP CONSTRAINT "celebration_schedules_celebration_id_fkey";

-- DropForeignKey
ALTER TABLE "export_jobs" DROP CONSTRAINT "export_jobs_congregation_id_fkey";

-- DropForeignKey
ALTER TABLE "export_jobs" DROP CONSTRAINT "export_jobs_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "import_jobs" DROP CONSTRAINT "import_jobs_congregation_id_fkey";

-- DropForeignKey
ALTER TABLE "import_jobs" DROP CONSTRAINT "import_jobs_tenant_id_fkey";

-- DropIndex
DROP INDEX "celebration_schedules_celebration_id_key";

-- AlterTable
ALTER TABLE "celebration_schedules" DROP COLUMN "celebration_id",
ADD COLUMN     "celebration_instance_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "celebrations" ADD COLUMN     "anchor_date" DATE;

-- AlterTable
ALTER TABLE "export_jobs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "import_jobs" ALTER COLUMN "id" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "celebration_schedules_celebration_instance_id_key" ON "celebration_schedules"("celebration_instance_id");

-- AddForeignKey
ALTER TABLE "celebration_schedules" ADD CONSTRAINT "celebration_schedules_celebration_instance_id_fkey" FOREIGN KEY ("celebration_instance_id") REFERENCES "celebration_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

