-- CreateEnum
CREATE TYPE "MaterialAudience" AS ENUM ('all_networks', 'network', 'group');

-- AlterTable
ALTER TABLE "study_materials" ADD COLUMN "audience" "MaterialAudience" NOT NULL DEFAULT 'group',
ADD COLUMN "network_id" TEXT,
ADD COLUMN "visibility" "MaterialVisibility" NOT NULL DEFAULT 'all';

-- CreateIndex
CREATE INDEX "study_materials_network_id_idx" ON "study_materials"("network_id");

-- AddForeignKey
ALTER TABLE "study_materials" ADD CONSTRAINT "study_materials_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "networks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
