-- CreateTable
CREATE TABLE "group_messages" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "small_group_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_messages_tenant_id_id_idx" ON "group_messages"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "group_messages_tenant_id_congregation_id_idx" ON "group_messages"("tenant_id", "congregation_id");

-- CreateIndex
CREATE INDEX "group_messages_small_group_id_created_at_idx" ON "group_messages"("small_group_id", "created_at");

-- AddForeignKey
ALTER TABLE "group_messages" ADD CONSTRAINT "group_messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_messages" ADD CONSTRAINT "group_messages_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_messages" ADD CONSTRAINT "group_messages_small_group_id_fkey" FOREIGN KEY ("small_group_id") REFERENCES "small_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_messages" ADD CONSTRAINT "group_messages_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
