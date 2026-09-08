-- CreateEnum
CREATE TYPE "ServiceOrderItemType" AS ENUM ('worship', 'sermon', 'prayer', 'announcements', 'offering', 'other');

-- AlterTable
ALTER TABLE "service_order_items" ADD COLUMN     "type" "ServiceOrderItemType" NOT NULL DEFAULT 'other';
