-- AlterTable
ALTER TABLE "group_meeting_materials" ADD COLUMN "release_at" TIMESTAMP(3),
ADD COLUMN "notified_at" TIMESTAMP(3);

-- Vínculos anteriores já estavam liberados e nunca geraram aviso: marcam como
-- avisados para o cron de liberação não disparar push retroativo.
UPDATE "group_meeting_materials" SET "notified_at" = "created_at";

-- CreateIndex
CREATE INDEX "group_meeting_materials_notified_at_release_at_idx" ON "group_meeting_materials"("notified_at", "release_at");
