/*
  Warnings:

  - Made the column `name` on table `audience_segments` required. This step will fail if there are existing NULL values in that column.
  - Made the column `criteria` on table `audience_segments` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "post_segments" DROP CONSTRAINT "post_segments_post_id_fkey";

-- DropForeignKey
ALTER TABLE "post_segments" DROP CONSTRAINT "post_segments_segment_id_fkey";

-- DropIndex
DROP INDEX "audience_segments_tenant_id_content_post_id_idx";

-- AlterTable
ALTER TABLE "audience_segments" ALTER COLUMN "name" SET NOT NULL,
ALTER COLUMN "criteria" SET NOT NULL;

-- CreateIndex
CREATE INDEX "audience_segments_tenant_id_congregation_id_idx" ON "audience_segments"("tenant_id", "congregation_id");

-- AddForeignKey
ALTER TABLE "post_segments" ADD CONSTRAINT "post_segments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "content_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_segments" ADD CONSTRAINT "post_segments_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "audience_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
