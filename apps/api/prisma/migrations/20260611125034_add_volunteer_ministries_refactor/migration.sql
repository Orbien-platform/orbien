/*
  Warnings:

  - You are about to drop the column `accepted_terms_at` on the `volunteer_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `ministries` on the `volunteer_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `weekly_availability` on the `volunteer_profiles` table. All the data in the column will be lost.
  - Added the required column `availability` to the `volunteer_profiles` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ministries" ADD COLUMN     "color" TEXT;

-- AlterTable
ALTER TABLE "volunteer_profiles" DROP COLUMN "accepted_terms_at",
DROP COLUMN "ministries",
DROP COLUMN "weekly_availability",
ADD COLUMN     "availability" JSONB NOT NULL;

-- CreateTable
CREATE TABLE "volunteer_ministries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "volunteer_profile_id" TEXT NOT NULL,
    "ministry_id" TEXT NOT NULL,
    "role_in_ministry" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "volunteer_ministries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "volunteer_ministries_tenant_id_volunteer_profile_id_idx" ON "volunteer_ministries"("tenant_id", "volunteer_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "volunteer_ministries_volunteer_profile_id_ministry_id_key" ON "volunteer_ministries"("volunteer_profile_id", "ministry_id");

-- AddForeignKey
ALTER TABLE "volunteer_ministries" ADD CONSTRAINT "volunteer_ministries_volunteer_profile_id_fkey" FOREIGN KEY ("volunteer_profile_id") REFERENCES "volunteer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_ministries" ADD CONSTRAINT "volunteer_ministries_ministry_id_fkey" FOREIGN KEY ("ministry_id") REFERENCES "ministries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_ministries" ADD CONSTRAINT "volunteer_ministries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_ministries" ADD CONSTRAINT "volunteer_ministries_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
