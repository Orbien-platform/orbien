-- AlterTable
ALTER TABLE "small_groups" ADD COLUMN     "network_id" TEXT;

-- CreateTable
CREATE TABLE "networks" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leader_person_id" TEXT,
    "health_goal_pct" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "networks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "networks_tenant_id_id_idx" ON "networks"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "networks_tenant_id_congregation_id_idx" ON "networks"("tenant_id", "congregation_id");

-- CreateIndex
CREATE INDEX "small_groups_tenant_id_network_id_idx" ON "small_groups"("tenant_id", "network_id");

-- AddForeignKey
ALTER TABLE "small_groups" ADD CONSTRAINT "small_groups_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "networks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "networks" ADD CONSTRAINT "networks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "networks" ADD CONSTRAINT "networks_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "networks" ADD CONSTRAINT "networks_leader_person_id_fkey" FOREIGN KEY ("leader_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
