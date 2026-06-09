-- DropIndex
DROP INDEX "content_posts_tenant_id_publish_at_idx";

-- AlterTable
ALTER TABLE "content_posts" ADD COLUMN     "is_draft" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "published_at" TIMESTAMP(3),
ALTER COLUMN "publish_at" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "content_posts_tenant_id_published_at_idx" ON "content_posts"("tenant_id", "published_at");
