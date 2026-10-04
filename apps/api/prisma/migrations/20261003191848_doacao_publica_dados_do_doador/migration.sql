-- AlterTable
ALTER TABLE "donation_receipts" ADD COLUMN     "recipient_email" VARCHAR(254),
ADD COLUMN     "recipient_name" VARCHAR(120),
ALTER COLUMN "person_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "pix_payments" ADD COLUMN     "donor_consent_version" VARCHAR(40),
ADD COLUMN     "donor_consented_at" TIMESTAMP(3),
ADD COLUMN     "donor_email" VARCHAR(254),
ADD COLUMN     "donor_name" VARCHAR(120);


-- Um recibo precisa dizer para quem foi: ou uma `Person` (doador cadastrado), ou
-- o e-mail que o doador público declarou. O Prisma não modela CHECK.
ALTER TABLE "donation_receipts"
  ADD CONSTRAINT "donation_receipts_recipient_chk"
  CHECK ("person_id" IS NOT NULL OR "recipient_email" IS NOT NULL);
