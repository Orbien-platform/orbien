-- Módulo Kids (AD-013): turmas, sessões por instância de culto, autorizados e
-- check-in nominal. Tabelas novas: nascem sem RLS aqui e recebem a policy de
-- congregação em 029_rls_kids.sql (fora do histórico do Prisma, aplicado pelo
-- bootstrap-db.sh).
-- CreateEnum
CREATE TYPE "KidsSessionStatus" AS ENUM ('open', 'cancelled');

-- AlterTable
ALTER TABLE "celebration_ministries" ADD COLUMN     "kids_session_id" TEXT;

-- AlterTable
ALTER TABLE "persons" ADD COLUMN     "is_child" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "kids_rooms" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "min_age_months" INTEGER NOT NULL,
    "max_age_months" INTEGER NOT NULL,
    "allows_out_of_range" BOOLEAN NOT NULL DEFAULT false,
    "capacity" INTEGER,
    "min_volunteers" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kids_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kids_sessions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "celebration_instance_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "status" "KidsSessionStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kids_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kids_guardians" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "guardian_person_id" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "can_pickup" BOOLEAN NOT NULL DEFAULT true,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kids_guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kids_checkins" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "celebration_instance_id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "guardian_person_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "age_override" BOOLEAN NOT NULL DEFAULT false,
    "override_reason" TEXT,
    "checked_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_in_by" TEXT NOT NULL,
    "checked_out_at" TIMESTAMP(3),
    "checked_out_by" TEXT,
    "picked_up_by_person_id" TEXT,
    "picked_up_by_name" TEXT,

    CONSTRAINT "kids_checkins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kids_rooms_tenant_id_congregation_id_idx" ON "kids_rooms"("tenant_id", "congregation_id");

-- CreateIndex
CREATE INDEX "kids_sessions_tenant_id_congregation_id_idx" ON "kids_sessions"("tenant_id", "congregation_id");

-- CreateIndex
CREATE UNIQUE INDEX "kids_sessions_celebration_instance_id_room_id_key" ON "kids_sessions"("celebration_instance_id", "room_id");

-- CreateIndex
CREATE UNIQUE INDEX "kids_sessions_id_celebration_instance_id_key" ON "kids_sessions"("id", "celebration_instance_id");

-- CreateIndex
CREATE INDEX "kids_guardians_tenant_id_congregation_id_idx" ON "kids_guardians"("tenant_id", "congregation_id");

-- CreateIndex
CREATE INDEX "kids_guardians_guardian_person_id_idx" ON "kids_guardians"("guardian_person_id");

-- CreateIndex
CREATE UNIQUE INDEX "kids_guardians_child_id_guardian_person_id_key" ON "kids_guardians"("child_id", "guardian_person_id");

-- CreateIndex
CREATE INDEX "kids_checkins_tenant_id_congregation_id_idx" ON "kids_checkins"("tenant_id", "congregation_id");

-- CreateIndex
CREATE INDEX "kids_checkins_child_id_idx" ON "kids_checkins"("child_id");

-- CreateIndex
CREATE INDEX "kids_checkins_guardian_person_id_idx" ON "kids_checkins"("guardian_person_id");

-- CreateIndex
CREATE UNIQUE INDEX "kids_checkins_session_id_code_key" ON "kids_checkins"("session_id", "code");

-- AddForeignKey
ALTER TABLE "celebration_ministries" ADD CONSTRAINT "celebration_ministries_kids_session_id_fkey" FOREIGN KEY ("kids_session_id") REFERENCES "kids_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kids_rooms" ADD CONSTRAINT "kids_rooms_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kids_rooms" ADD CONSTRAINT "kids_rooms_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kids_sessions" ADD CONSTRAINT "kids_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kids_sessions" ADD CONSTRAINT "kids_sessions_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kids_sessions" ADD CONSTRAINT "kids_sessions_celebration_instance_id_fkey" FOREIGN KEY ("celebration_instance_id") REFERENCES "celebration_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kids_sessions" ADD CONSTRAINT "kids_sessions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "kids_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kids_guardians" ADD CONSTRAINT "kids_guardians_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kids_guardians" ADD CONSTRAINT "kids_guardians_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kids_guardians" ADD CONSTRAINT "kids_guardians_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kids_guardians" ADD CONSTRAINT "kids_guardians_guardian_person_id_fkey" FOREIGN KEY ("guardian_person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kids_checkins" ADD CONSTRAINT "kids_checkins_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kids_checkins" ADD CONSTRAINT "kids_checkins_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kids_checkins" ADD CONSTRAINT "kids_checkins_session_id_celebration_instance_id_fkey" FOREIGN KEY ("session_id", "celebration_instance_id") REFERENCES "kids_sessions"("id", "celebration_instance_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kids_checkins" ADD CONSTRAINT "kids_checkins_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kids_checkins" ADD CONSTRAINT "kids_checkins_guardian_person_id_fkey" FOREIGN KEY ("guardian_person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

