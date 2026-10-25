-- CreateTable
CREATE TABLE "service_order_templates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_order_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_order_template_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ServiceOrderItemType" NOT NULL DEFAULT 'other',
    "start_offset_minutes" INTEGER NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "phase" "ServiceOrderPhase" NOT NULL DEFAULT 'during',
    "entry_kind" "ServiceOrderEntryKind" NOT NULL DEFAULT 'program',
    "responsible_type" "ResponsibleType" NOT NULL,
    "person_id" TEXT,
    "ministry_id" TEXT,
    "responsible_label" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_order_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_order_templates_tenant_id_congregation_id_idx" ON "service_order_templates"("tenant_id", "congregation_id");

-- CreateIndex
CREATE INDEX "service_order_template_items_template_id_idx" ON "service_order_template_items"("template_id");

-- CreateIndex
CREATE INDEX "service_order_template_items_tenant_id_congregation_id_idx" ON "service_order_template_items"("tenant_id", "congregation_id");

-- AddForeignKey
ALTER TABLE "service_order_templates" ADD CONSTRAINT "service_order_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_templates" ADD CONSTRAINT "service_order_templates_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_template_items" ADD CONSTRAINT "service_order_template_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_template_items" ADD CONSTRAINT "service_order_template_items_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_template_items" ADD CONSTRAINT "service_order_template_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "service_order_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_template_items" ADD CONSTRAINT "service_order_template_items_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_template_items" ADD CONSTRAINT "service_order_template_items_ministry_id_fkey" FOREIGN KEY ("ministry_id") REFERENCES "ministries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

