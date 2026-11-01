-- CreateTable
CREATE TABLE "kids_checkin_qr_tokens" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "guardian_person_id" TEXT NOT NULL,
    "issued_by" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "used_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kids_checkin_qr_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kids_checkin_qr_tokens_tenant_id_congregation_id_idx" ON "kids_checkin_qr_tokens"("tenant_id", "congregation_id");

-- CreateIndex
CREATE INDEX "kids_checkin_qr_tokens_child_id_guardian_person_id_idx" ON "kids_checkin_qr_tokens"("child_id", "guardian_person_id");

-- AddForeignKey
ALTER TABLE "kids_checkin_qr_tokens" ADD CONSTRAINT "kids_checkin_qr_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kids_checkin_qr_tokens" ADD CONSTRAINT "kids_checkin_qr_tokens_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kids_checkin_qr_tokens" ADD CONSTRAINT "kids_checkin_qr_tokens_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kids_checkin_qr_tokens" ADD CONSTRAINT "kids_checkin_qr_tokens_guardian_person_id_fkey" FOREIGN KEY ("guardian_person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

