-- AlterTable
ALTER TABLE "branding_configs" ADD COLUMN     "cloudflare_access_token_encrypted" TEXT,
ADD COLUMN     "cloudflare_connected_at" TIMESTAMP(3),
ADD COLUMN     "cloudflare_refresh_token_encrypted" TEXT,
ADD COLUMN     "cloudflare_token_expires_at" TIMESTAMP(3),
ADD COLUMN     "cloudflare_zone_id" TEXT,
ADD COLUMN     "custom_domain_status" TEXT NOT NULL DEFAULT 'pending';
