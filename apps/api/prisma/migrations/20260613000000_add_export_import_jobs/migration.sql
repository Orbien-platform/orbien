-- Migration: add export_jobs and import_jobs with RLS (Padrão B)

-- Enums
CREATE TYPE "ExportJobType" AS ENUM ('csv', 'ofx', 'pdf', 'zip', 'sped', 'dre');
CREATE TYPE "JobStatus"     AS ENUM ('pending', 'processing', 'done', 'error');

-- export_jobs
CREATE TABLE "export_jobs" (
  "id"              TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id"       TEXT        NOT NULL,
  "congregation_id" TEXT        NOT NULL,
  "type"            "ExportJobType" NOT NULL,
  "status"          "JobStatus" NOT NULL DEFAULT 'pending',
  "period_start"    TIMESTAMP(3) NOT NULL,
  "period_end"      TIMESTAMP(3) NOT NULL,
  "file_url"        TEXT,
  "error_message"   TEXT,
  "created_by"      TEXT        NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "export_jobs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "export_jobs_congregation_id_fkey"
    FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE
);

CREATE INDEX "export_jobs_tenant_id_congregation_id_idx" ON "export_jobs"("tenant_id", "congregation_id");
CREATE INDEX "export_jobs_tenant_id_created_at_idx"      ON "export_jobs"("tenant_id", "created_at" DESC);

-- import_jobs
CREATE TABLE "import_jobs" (
  "id"              TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id"       TEXT        NOT NULL,
  "congregation_id" TEXT        NOT NULL,
  "type"            TEXT        NOT NULL,
  "status"          "JobStatus" NOT NULL DEFAULT 'pending',
  "total_rows"      INTEGER     NOT NULL DEFAULT 0,
  "imported"        INTEGER     NOT NULL DEFAULT 0,
  "skipped"         INTEGER     NOT NULL DEFAULT 0,
  "errors"          JSONB       NOT NULL DEFAULT '[]',
  "created_by"      TEXT        NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "import_jobs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "import_jobs_congregation_id_fkey"
    FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE
);

CREATE INDEX "import_jobs_tenant_id_congregation_id_idx" ON "import_jobs"("tenant_id", "congregation_id");
CREATE INDEX "import_jobs_tenant_id_created_at_idx"      ON "import_jobs"("tenant_id", "created_at" DESC);

-- RLS — Padrão B: tenant + congregation isolation
ALTER TABLE "export_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "export_jobs" FORCE ROW LEVEL SECURITY;

CREATE POLICY "export_jobs_tenant_isolation" ON "export_jobs"
  USING (
    tenant_id       = current_setting('app.tenant_id', true)
    AND congregation_id = current_setting('app.congregation_id', true)
  )
  WITH CHECK (
    tenant_id       = current_setting('app.tenant_id', true)
    AND congregation_id = current_setting('app.congregation_id', true)
  );

ALTER TABLE "import_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "import_jobs" FORCE ROW LEVEL SECURITY;

CREATE POLICY "import_jobs_tenant_isolation" ON "import_jobs"
  USING (
    tenant_id       = current_setting('app.tenant_id', true)
    AND congregation_id = current_setting('app.congregation_id', true)
  )
  WITH CHECK (
    tenant_id       = current_setting('app.tenant_id', true)
    AND congregation_id = current_setting('app.congregation_id', true)
  );

-- BYPASSRLS para o role de sistema (schedulers)
ALTER TABLE "export_jobs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "import_jobs" FORCE ROW LEVEL SECURITY;
