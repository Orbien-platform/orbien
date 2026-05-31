-- CreateEnum
CREATE TYPE "WaitlistSizeRange" AS ENUM ('ate_50', 'ate_150', 'ate_300', 'acima_300');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('pending', 'contacted', 'activated', 'declined');

-- CreateTable
CREATE TABLE "waitlist_subscribers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "pastor_name" TEXT NOT NULL,
    "church_name" TEXT,
    "city" TEXT,
    "state" TEXT,
    "size_range" "WaitlistSizeRange" NOT NULL,
    "lgpd_consent" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "tenant_id" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contacted_at" TIMESTAMP(3),
    "activated_at" TIMESTAMP(3),

    CONSTRAINT "waitlist_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_subscribers_email_key" ON "waitlist_subscribers"("email");

-- CreateIndex
CREATE INDEX "waitlist_subscribers_status_idx" ON "waitlist_subscribers"("status");

-- CreateIndex
CREATE INDEX "waitlist_subscribers_created_at_idx" ON "waitlist_subscribers"("created_at" DESC);
