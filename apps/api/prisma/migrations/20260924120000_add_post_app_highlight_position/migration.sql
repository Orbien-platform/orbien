-- AlterTable
ALTER TABLE "content_posts" ADD COLUMN     "app_highlight_position" INTEGER;

-- CreateIndex
CREATE INDEX "content_posts_tenant_id_congregation_id_app_highlight_posit_idx" ON "content_posts"("tenant_id", "congregation_id", "app_highlight_position");
