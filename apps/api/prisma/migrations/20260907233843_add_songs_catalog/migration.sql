-- AlterTable
ALTER TABLE "setlist_songs" ADD COLUMN     "song_id" TEXT;

-- CreateTable
CREATE TABLE "songs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "key" TEXT,
    "bpm" INTEGER,
    "link" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "songs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "songs_tenant_id_congregation_id_idx" ON "songs"("tenant_id", "congregation_id");

-- CreateIndex
CREATE INDEX "songs_tenant_id_id_idx" ON "songs"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "setlist_songs" ADD CONSTRAINT "setlist_songs_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "songs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "songs" ADD CONSTRAINT "songs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "songs" ADD CONSTRAINT "songs_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
