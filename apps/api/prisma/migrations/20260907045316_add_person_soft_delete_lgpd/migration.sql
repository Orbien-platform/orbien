-- AlterTable
ALTER TABLE "persons" ADD COLUMN     "anonymization_reason" TEXT,
ADD COLUMN     "anonymized_at" TIMESTAMP(3),
ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "persons_deleted_at_idx" ON "persons"("deleted_at");
