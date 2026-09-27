-- CreateEnum
CREATE TYPE "PixSubscriptionStatus" AS ENUM ('active', 'cancelled');

-- AlterEnum
ALTER TYPE "PixScenario" ADD VALUE 'recurring';

-- AlterTable
ALTER TABLE "pix_payments" ADD COLUMN     "pix_subscription_id" TEXT;

-- CreateTable
CREATE TABLE "pix_subscriptions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "donor_person_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "asaas_subscription_id" TEXT NOT NULL,
    "status" "PixSubscriptionStatus" NOT NULL DEFAULT 'active',
    "created_by_user_id" TEXT NOT NULL,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pix_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pix_subscriptions_asaas_subscription_id_key" ON "pix_subscriptions"("asaas_subscription_id");

-- CreateIndex
CREATE INDEX "pix_subscriptions_tenant_id_id_idx" ON "pix_subscriptions"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "pix_subscriptions_tenant_id_congregation_id_idx" ON "pix_subscriptions"("tenant_id", "congregation_id");

-- CreateIndex
CREATE INDEX "pix_subscriptions_tenant_id_status_idx" ON "pix_subscriptions"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pix_payments_asaas_payment_id_key" ON "pix_payments"("asaas_payment_id");

-- CreateIndex
CREATE INDEX "pix_payments_pix_subscription_id_idx" ON "pix_payments"("pix_subscription_id");

-- AddForeignKey
ALTER TABLE "pix_payments" ADD CONSTRAINT "pix_payments_pix_subscription_id_fkey" FOREIGN KEY ("pix_subscription_id") REFERENCES "pix_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pix_subscriptions" ADD CONSTRAINT "pix_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pix_subscriptions" ADD CONSTRAINT "pix_subscriptions_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pix_subscriptions" ADD CONSTRAINT "pix_subscriptions_donor_person_id_fkey" FOREIGN KEY ("donor_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pix_subscriptions" ADD CONSTRAINT "pix_subscriptions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "financial_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

