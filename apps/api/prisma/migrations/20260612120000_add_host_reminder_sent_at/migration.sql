-- AlterTable: celebration_instances — track when host reminder was sent
ALTER TABLE "celebration_instances" ADD COLUMN "host_reminder_sent_at" TIMESTAMP(3);
