-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('pending', 'confirmed');

-- AlterTable: every transaction, existing or new, starts as 'pending' until it is
-- included in an accounting export (CSV, OFX, SPED, DRE PDF), which marks it 'confirmed'.
ALTER TABLE "financial_transactions" ADD COLUMN "status" "TransactionStatus" NOT NULL DEFAULT 'pending';
