-- CreateEnum
CREATE TYPE "RecurringRuleMode" AS ENUM ('installment', 'fixed');

-- AlterTable
ALTER TABLE "recurring_rules" ADD COLUMN     "installments" INTEGER,
ADD COLUMN     "mode" "RecurringRuleMode" NOT NULL DEFAULT 'fixed';
