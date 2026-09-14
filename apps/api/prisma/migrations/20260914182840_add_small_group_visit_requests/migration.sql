-- CreateTable
CREATE TABLE "small_group_visit_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "small_group_id" TEXT NOT NULL,
    "visitor_name" TEXT NOT NULL,
    "visitor_phone" TEXT,
    "visitor_email" TEXT,
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "small_group_visit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "small_group_visit_requests_tenant_id_id_idx" ON "small_group_visit_requests"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "small_group_visit_requests_tenant_id_congregation_id_idx" ON "small_group_visit_requests"("tenant_id", "congregation_id");

-- CreateIndex
CREATE INDEX "small_group_visit_requests_small_group_id_created_at_idx" ON "small_group_visit_requests"("small_group_id", "created_at");

-- AddForeignKey
ALTER TABLE "small_group_visit_requests" ADD CONSTRAINT "small_group_visit_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "small_group_visit_requests" ADD CONSTRAINT "small_group_visit_requests_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "small_group_visit_requests" ADD CONSTRAINT "small_group_visit_requests_small_group_id_fkey" FOREIGN KEY ("small_group_id") REFERENCES "small_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
