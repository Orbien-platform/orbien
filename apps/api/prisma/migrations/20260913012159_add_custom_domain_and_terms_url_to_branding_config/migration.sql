-- AlterTable
ALTER TABLE "branding_configs" ADD COLUMN     "custom_domain" TEXT,
ADD COLUMN     "terms_url" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "branding_configs_custom_domain_key" ON "branding_configs"("custom_domain");
