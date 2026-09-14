-- CreateEnum
CREATE TYPE "EventRegistrationStatus" AS ENUM ('confirmed', 'waitlisted', 'cancelled');

-- AlterTable
ALTER TABLE "content_posts" ADD COLUMN     "event_ends_at" TIMESTAMP(3),
ADD COLUMN     "event_location" TEXT,
ADD COLUMN     "event_starts_at" TIMESTAMP(3),
ADD COLUMN     "registration_deadline" TIMESTAMP(3),
ADD COLUMN     "registration_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "registration_limit" INTEGER;

-- CreateTable
CREATE TABLE "event_registrations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "content_post_id" TEXT NOT NULL,
    "person_id" TEXT,
    "full_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "status" "EventRegistrationStatus" NOT NULL DEFAULT 'confirmed',
    "registered_by_user_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_registrations_tenant_id_id_idx" ON "event_registrations"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "event_registrations_tenant_id_congregation_id_idx" ON "event_registrations"("tenant_id", "congregation_id");

-- CreateIndex
CREATE INDEX "event_registrations_content_post_id_status_created_at_idx" ON "event_registrations"("content_post_id", "status", "created_at");

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_content_post_id_fkey" FOREIGN KEY ("content_post_id") REFERENCES "content_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Inscrição repetida no mesmo evento (PROD-16)
--
-- Únicos PARCIAIS, ignorando `cancelled`: quem cancela pode se inscrever de
-- novo, e a linha cancelada fica como histórico em vez de virar obstáculo. O
-- Prisma não modela unique parcial — daí o SQL à mão, e por isso `@@unique`
-- não aparece no schema.
--
-- Dois índices e não um: a identidade do inscrito é `person_id` quando ele tem
-- cadastro e `email` quando é convidado de fora. NULL não conflita com NULL no
-- Postgres, então cada índice só vale para as linhas que têm aquela coluna —
-- que é exatamente o desejado.
CREATE UNIQUE INDEX "event_registrations_post_person_active_key"
  ON "event_registrations"("content_post_id", "person_id")
  WHERE "person_id" IS NOT NULL AND "status" <> 'cancelled';

CREATE UNIQUE INDEX "event_registrations_post_email_active_key"
  ON "event_registrations"("content_post_id", lower("email"))
  WHERE "email" IS NOT NULL AND "status" <> 'cancelled';
