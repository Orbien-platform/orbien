-- CreateTable
CREATE TABLE "bible_verse_marks" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT 'NVI',
    "book_code" TEXT NOT NULL,
    "chapter" INTEGER NOT NULL,
    "verse_start" INTEGER NOT NULL,
    "verse_end" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_person_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bible_verse_marks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bible_chapter_cache" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "book_code" TEXT NOT NULL,
    "chapter" INTEGER NOT NULL,
    "verses" JSONB NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bible_chapter_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bible_verse_marks_tenant_id_id_idx" ON "bible_verse_marks"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "bible_verse_marks_tenant_id_congregation_id_created_at_idx" ON "bible_verse_marks"("tenant_id", "congregation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "bible_chapter_cache_version_book_code_chapter_key" ON "bible_chapter_cache"("version", "book_code", "chapter");

-- AddForeignKey
ALTER TABLE "bible_verse_marks" ADD CONSTRAINT "bible_verse_marks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bible_verse_marks" ADD CONSTRAINT "bible_verse_marks_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bible_verse_marks" ADD CONSTRAINT "bible_verse_marks_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
