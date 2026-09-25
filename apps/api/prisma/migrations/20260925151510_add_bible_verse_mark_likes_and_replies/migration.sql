-- CreateTable
CREATE TABLE "bible_verse_mark_likes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "mark_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bible_verse_mark_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bible_verse_mark_replies" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "mark_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_person_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bible_verse_mark_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bible_verse_mark_likes_tenant_id_congregation_id_idx" ON "bible_verse_mark_likes"("tenant_id", "congregation_id");

-- CreateIndex
CREATE UNIQUE INDEX "bible_verse_mark_likes_mark_id_person_id_key" ON "bible_verse_mark_likes"("mark_id", "person_id");

-- CreateIndex
CREATE INDEX "bible_verse_mark_replies_mark_id_created_at_idx" ON "bible_verse_mark_replies"("mark_id", "created_at");

-- CreateIndex
CREATE INDEX "bible_verse_mark_replies_tenant_id_congregation_id_idx" ON "bible_verse_mark_replies"("tenant_id", "congregation_id");

-- AddForeignKey
ALTER TABLE "bible_verse_mark_likes" ADD CONSTRAINT "bible_verse_mark_likes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bible_verse_mark_likes" ADD CONSTRAINT "bible_verse_mark_likes_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bible_verse_mark_likes" ADD CONSTRAINT "bible_verse_mark_likes_mark_id_fkey" FOREIGN KEY ("mark_id") REFERENCES "bible_verse_marks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bible_verse_mark_likes" ADD CONSTRAINT "bible_verse_mark_likes_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bible_verse_mark_replies" ADD CONSTRAINT "bible_verse_mark_replies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bible_verse_mark_replies" ADD CONSTRAINT "bible_verse_mark_replies_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bible_verse_mark_replies" ADD CONSTRAINT "bible_verse_mark_replies_mark_id_fkey" FOREIGN KEY ("mark_id") REFERENCES "bible_verse_marks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bible_verse_mark_replies" ADD CONSTRAINT "bible_verse_mark_replies_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
