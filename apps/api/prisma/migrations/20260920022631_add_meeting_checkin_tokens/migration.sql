-- CreateTable
CREATE TABLE "meeting_checkin_tokens" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "group_meeting_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_checkin_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meeting_checkin_tokens_group_meeting_id_key" ON "meeting_checkin_tokens"("group_meeting_id");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_checkin_tokens_token_key" ON "meeting_checkin_tokens"("token");

-- CreateIndex
CREATE INDEX "meeting_checkin_tokens_tenant_id_id_idx" ON "meeting_checkin_tokens"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "meeting_checkin_tokens_tenant_id_congregation_id_idx" ON "meeting_checkin_tokens"("tenant_id", "congregation_id");

-- AddForeignKey
ALTER TABLE "meeting_checkin_tokens" ADD CONSTRAINT "meeting_checkin_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_checkin_tokens" ADD CONSTRAINT "meeting_checkin_tokens_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_checkin_tokens" ADD CONSTRAINT "meeting_checkin_tokens_group_meeting_id_fkey" FOREIGN KEY ("group_meeting_id") REFERENCES "group_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
