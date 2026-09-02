-- =============================================================================
-- ORBIEN — Sprint 11.2 Fatia 1: Escalas vinculadas a celebrações
-- Cria 7 tabelas: celebration_schedules, celebration_ministries,
-- celebration_assignments, volunteer_unavailabilities,
-- volunteer_unavailability_dates, schedule_templates,
-- schedule_template_ministries
-- =============================================================================

-- CreateTable
CREATE TABLE "celebration_schedules" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "celebration_id" TEXT NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "celebration_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "celebration_ministries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "ministry_id" TEXT NOT NULL,
    "slots" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "celebration_ministries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "celebration_assignments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "celebration_ministry_id" TEXT NOT NULL,
    "volunteer_profile_id" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'pending',
    "notified_at" TIMESTAMP(3),
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "celebration_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_unavailabilities" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "volunteer_profile_id" TEXT NOT NULL,
    "reference_month" INTEGER NOT NULL,
    "reference_year" INTEGER NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "volunteer_unavailabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_unavailability_dates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "unavailability_id" TEXT NOT NULL,
    "date" DATE NOT NULL,

    CONSTRAINT "volunteer_unavailability_dates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_templates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_template_ministries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "ministry_id" TEXT NOT NULL,
    "slots" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "schedule_template_ministries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "celebration_schedules_celebration_id_key" ON "celebration_schedules"("celebration_id");

-- CreateIndex
CREATE INDEX "celebration_schedules_congregation_id_idx" ON "celebration_schedules"("congregation_id");

-- CreateIndex
CREATE INDEX "celebration_ministries_congregation_id_idx" ON "celebration_ministries"("congregation_id");

-- CreateIndex
CREATE UNIQUE INDEX "celebration_ministries_schedule_id_ministry_id_key" ON "celebration_ministries"("schedule_id", "ministry_id");

-- CreateIndex
CREATE INDEX "celebration_assignments_congregation_id_idx" ON "celebration_assignments"("congregation_id");

-- CreateIndex
CREATE INDEX "celebration_assignments_volunteer_profile_id_idx" ON "celebration_assignments"("volunteer_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "celebration_assignments_celebration_ministry_id_volunteer_p_key" ON "celebration_assignments"("celebration_ministry_id", "volunteer_profile_id");

-- CreateIndex
CREATE INDEX "volunteer_unavailabilities_congregation_id_idx" ON "volunteer_unavailabilities"("congregation_id");

-- CreateIndex
CREATE UNIQUE INDEX "volunteer_unavailabilities_volunteer_profile_id_reference_m_key" ON "volunteer_unavailabilities"("volunteer_profile_id", "reference_month", "reference_year");

-- CreateIndex
CREATE INDEX "volunteer_unavailability_dates_congregation_id_date_idx" ON "volunteer_unavailability_dates"("congregation_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "volunteer_unavailability_dates_unavailability_id_date_key" ON "volunteer_unavailability_dates"("unavailability_id", "date");

-- CreateIndex
CREATE INDEX "schedule_templates_congregation_id_idx" ON "schedule_templates"("congregation_id");

-- CreateIndex
CREATE INDEX "schedule_template_ministries_congregation_id_idx" ON "schedule_template_ministries"("congregation_id");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_template_ministries_template_id_ministry_id_key" ON "schedule_template_ministries"("template_id", "ministry_id");

-- AddForeignKey
ALTER TABLE "celebration_schedules" ADD CONSTRAINT "celebration_schedules_celebration_id_fkey"
    FOREIGN KEY ("celebration_id") REFERENCES "celebrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "celebration_ministries" ADD CONSTRAINT "celebration_ministries_schedule_id_fkey"
    FOREIGN KEY ("schedule_id") REFERENCES "celebration_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "celebration_ministries" ADD CONSTRAINT "celebration_ministries_ministry_id_fkey"
    FOREIGN KEY ("ministry_id") REFERENCES "ministries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "celebration_assignments" ADD CONSTRAINT "celebration_assignments_celebration_ministry_id_fkey"
    FOREIGN KEY ("celebration_ministry_id") REFERENCES "celebration_ministries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "celebration_assignments" ADD CONSTRAINT "celebration_assignments_volunteer_profile_id_fkey"
    FOREIGN KEY ("volunteer_profile_id") REFERENCES "volunteer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_unavailabilities" ADD CONSTRAINT "volunteer_unavailabilities_volunteer_profile_id_fkey"
    FOREIGN KEY ("volunteer_profile_id") REFERENCES "volunteer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_unavailability_dates" ADD CONSTRAINT "volunteer_unavailability_dates_unavailability_id_fkey"
    FOREIGN KEY ("unavailability_id") REFERENCES "volunteer_unavailabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_template_ministries" ADD CONSTRAINT "schedule_template_ministries_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "schedule_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_template_ministries" ADD CONSTRAINT "schedule_template_ministries_ministry_id_fkey"
    FOREIGN KEY ("ministry_id") REFERENCES "ministries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
