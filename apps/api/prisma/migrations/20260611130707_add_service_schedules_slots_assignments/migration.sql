-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateTable
CREATE TABLE "service_schedules" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "ministry_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scheduled_date" TIMESTAMP(3) NOT NULL,
    "deadline_confirm_at" TIMESTAMP(3),
    "status" "ScheduleStatus" NOT NULL DEFAULT 'draft',
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_slots" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "role_name" TEXT NOT NULL,
    "required_count" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_assignments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "slot_id" TEXT NOT NULL,
    "volunteer_profile_id" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'pending',
    "checkin_token" TEXT NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_schedules_tenant_id_ministry_id_idx" ON "service_schedules"("tenant_id", "ministry_id");

-- CreateIndex
CREATE INDEX "service_schedules_tenant_id_scheduled_date_idx" ON "service_schedules"("tenant_id", "scheduled_date");

-- CreateIndex
CREATE INDEX "schedule_slots_tenant_id_schedule_id_idx" ON "schedule_slots"("tenant_id", "schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_assignments_checkin_token_key" ON "schedule_assignments"("checkin_token");

-- CreateIndex
CREATE INDEX "schedule_assignments_tenant_id_slot_id_idx" ON "schedule_assignments"("tenant_id", "slot_id");

-- CreateIndex
CREATE INDEX "schedule_assignments_checkin_token_idx" ON "schedule_assignments"("checkin_token");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_assignments_slot_id_volunteer_profile_id_key" ON "schedule_assignments"("slot_id", "volunteer_profile_id");

-- AddForeignKey
ALTER TABLE "service_schedules" ADD CONSTRAINT "service_schedules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_schedules" ADD CONSTRAINT "service_schedules_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_schedules" ADD CONSTRAINT "service_schedules_ministry_id_fkey" FOREIGN KEY ("ministry_id") REFERENCES "ministries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "service_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "schedule_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_volunteer_profile_id_fkey" FOREIGN KEY ("volunteer_profile_id") REFERENCES "volunteer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
