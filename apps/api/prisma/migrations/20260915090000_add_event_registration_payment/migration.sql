-- CreateEnum
CREATE TYPE "EventRegistrationPaymentStatus" AS ENUM ('not_required', 'pending', 'paid', 'refunded');

-- AlterEnum
ALTER TYPE "EventRegistrationStatus" ADD VALUE 'pending_payment';

-- AlterEnum
ALTER TYPE "PixScenario" ADD VALUE 'event_registration';

-- AlterTable
ALTER TABLE "content_posts" ADD COLUMN     "registration_price" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "event_registrations" ADD COLUMN     "payment_status" "EventRegistrationPaymentStatus" NOT NULL DEFAULT 'not_required',
ADD COLUMN     "pix_payment_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "event_registrations_pix_payment_id_key" ON "event_registrations"("pix_payment_id");

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_pix_payment_id_fkey" FOREIGN KEY ("pix_payment_id") REFERENCES "pix_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
