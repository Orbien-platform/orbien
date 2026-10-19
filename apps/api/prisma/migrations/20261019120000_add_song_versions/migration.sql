-- Uma música passa a ter N versões: tudo que não é título (tom, bpm, links,
-- notas) sai de `songs` e vai para `song_versions`. O "tom alternativo" deixa
-- de existir como campo — cada versão tem o seu tom.

-- CreateTable
CREATE TABLE "song_versions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "song_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "key" TEXT,
    "bpm" INTEGER,
    "link" TEXT,
    "youtube_link" TEXT,
    "spotify_link" TEXT,
    "cifra_club_link" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "song_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "song_versions_tenant_id_congregation_id_idx" ON "song_versions"("tenant_id", "congregation_id");

-- CreateIndex
CREATE INDEX "song_versions_song_id_idx" ON "song_versions"("song_id");

-- AddForeignKey
ALTER TABLE "song_versions" ADD CONSTRAINT "song_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_versions" ADD CONSTRAINT "song_versions_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_versions" ADD CONSTRAINT "song_versions_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "setlist_songs" ADD COLUMN "song_version_id" TEXT,
ADD COLUMN "version_label" TEXT;

-- AddForeignKey
ALTER TABLE "setlist_songs" ADD CONSTRAINT "setlist_songs_song_version_id_fkey" FOREIGN KEY ("song_version_id") REFERENCES "song_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: cada música existente vira uma versão "Original" com os campos
-- que tinha. Quem tinha tom alternativo ganha uma segunda versão com esse tom,
-- para não perder a informação.
INSERT INTO "song_versions" ("id", "tenant_id", "congregation_id", "song_id", "label", "key", "bpm", "link", "youtube_link", "spotify_link", "cifra_club_link", "notes", "created_at", "updated_at")
SELECT gen_random_uuid()::text, "tenant_id", "congregation_id", "id", 'Original', "key", "bpm", "link", "youtube_link", "spotify_link", "cifra_club_link", "notes", "created_at", CURRENT_TIMESTAMP
FROM "songs";

INSERT INTO "song_versions" ("id", "tenant_id", "congregation_id", "song_id", "label", "key", "bpm", "link", "youtube_link", "spotify_link", "cifra_club_link", "notes", "created_at", "updated_at")
SELECT gen_random_uuid()::text, "tenant_id", "congregation_id", "id", 'Tom ' || "key_alt", "key_alt", "bpm", "link", "youtube_link", "spotify_link", "cifra_club_link", "notes", "created_at", CURRENT_TIMESTAMP
FROM "songs"
WHERE "key_alt" IS NOT NULL AND btrim("key_alt") <> '';

-- Setlists já montadas: a versão é a que tem o tom gravado na setlist; sem
-- coincidência, a "Original".
UPDATE "setlist_songs" ss
SET "song_version_id" = v."id", "version_label" = v."label"
FROM "song_versions" v
WHERE ss."song_id" = v."song_id"
  AND v."label" = 'Original'
  AND ss."song_version_id" IS NULL;

UPDATE "setlist_songs" ss
SET "song_version_id" = v."id", "version_label" = v."label"
FROM "song_versions" v
WHERE ss."song_id" = v."song_id"
  AND v."label" <> 'Original'
  AND ss."key" IS NOT DISTINCT FROM v."key"
  AND v."key" IS NOT NULL;

-- AlterTable
ALTER TABLE "songs" DROP COLUMN "key",
DROP COLUMN "key_alt",
DROP COLUMN "bpm",
DROP COLUMN "link",
DROP COLUMN "youtube_link",
DROP COLUMN "spotify_link",
DROP COLUMN "cifra_club_link",
DROP COLUMN "notes";
