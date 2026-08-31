-- AlterTable: setlists — add tenant_id, congregation_id
ALTER TABLE "setlists"
  ADD COLUMN "tenant_id"       TEXT NOT NULL DEFAULT '',
  ADD COLUMN "congregation_id" TEXT NOT NULL DEFAULT '';
ALTER TABLE "setlists"
  ALTER COLUMN "tenant_id"       DROP DEFAULT,
  ALTER COLUMN "congregation_id" DROP DEFAULT;

-- AlterTable: setlist_songs — rename position→sequence, musical_key→key (make optional), add tenant/congregation/notes
ALTER TABLE "setlist_songs"
  RENAME COLUMN "position" TO "sequence";

ALTER TABLE "setlist_songs"
  RENAME COLUMN "musical_key" TO "key";

ALTER TABLE "setlist_songs"
  ALTER COLUMN "key" DROP NOT NULL;

ALTER TABLE "setlist_songs"
  ADD COLUMN "tenant_id"       TEXT NOT NULL DEFAULT '',
  ADD COLUMN "congregation_id" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "notes"           TEXT;
ALTER TABLE "setlist_songs"
  ALTER COLUMN "tenant_id"       DROP DEFAULT,
  ALTER COLUMN "congregation_id" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "setlists_tenant_id_congregation_id_idx" ON "setlists"("tenant_id", "congregation_id");
CREATE INDEX "setlist_songs_tenant_id_setlist_id_idx" ON "setlist_songs"("tenant_id", "setlist_id");

-- AddForeignKey
ALTER TABLE "setlists" ADD CONSTRAINT "setlists_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "setlists" ADD CONSTRAINT "setlists_congregation_id_fkey"
  FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "setlist_songs" ADD CONSTRAINT "setlist_songs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "setlist_songs" ADD CONSTRAINT "setlist_songs_congregation_id_fkey"
  FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: setlists
ALTER TABLE "setlists" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "setlists" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "setlists";
CREATE POLICY "tenant_isolation" ON "setlists"
  USING (congregation_id = current_setting('app.congregation_id', true));

-- RLS: setlist_songs
ALTER TABLE "setlist_songs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "setlist_songs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "setlist_songs";
CREATE POLICY "tenant_isolation" ON "setlist_songs"
  USING (congregation_id = current_setting('app.congregation_id', true));
