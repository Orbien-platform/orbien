-- CreateEnum
CREATE TYPE "SwapStatus" AS ENUM ('pending', 'accepted', 'rejected', 'cancelled');

-- AlterTable
ALTER TABLE "schedule_assignments" ADD COLUMN     "checked_in_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "volunteer_swap_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "substitute_id" TEXT,
    "status" "SwapStatus" NOT NULL DEFAULT 'pending',
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "volunteer_swap_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "volunteer_swap_requests_tenant_id_assignment_id_idx" ON "volunteer_swap_requests"("tenant_id", "assignment_id");

-- AddForeignKey
ALTER TABLE "volunteer_swap_requests" ADD CONSTRAINT "volunteer_swap_requests_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "schedule_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_swap_requests" ADD CONSTRAINT "volunteer_swap_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "volunteer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_swap_requests" ADD CONSTRAINT "volunteer_swap_requests_substitute_id_fkey" FOREIGN KEY ("substitute_id") REFERENCES "volunteer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_swap_requests" ADD CONSTRAINT "volunteer_swap_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_swap_requests" ADD CONSTRAINT "volunteer_swap_requests_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: volunteer_swap_requests
ALTER TABLE "volunteer_swap_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "volunteer_swap_requests" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "volunteer_swap_requests"
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    tenant_id = app_current_tenant()
    AND congregation_id = app_current_congregation()
  )
  WITH CHECK (
    tenant_id = app_current_tenant()
    AND congregation_id = app_current_congregation()
  );
