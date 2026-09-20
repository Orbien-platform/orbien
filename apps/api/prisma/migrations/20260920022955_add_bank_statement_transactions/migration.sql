-- CreateTable
CREATE TABLE "bank_statement_transactions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "import_job_id" TEXT NOT NULL,
    "fitid" TEXT NOT NULL,
    "posted_at" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "is_credit" BOOLEAN NOT NULL,
    "description" TEXT,
    "financial_transaction_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_statement_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_transactions_financial_transaction_id_key" ON "bank_statement_transactions"("financial_transaction_id");

-- CreateIndex
CREATE INDEX "bank_statement_transactions_tenant_id_congregation_id_impor_idx" ON "bank_statement_transactions"("tenant_id", "congregation_id", "import_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_transactions_tenant_id_congregation_id_fitid_key" ON "bank_statement_transactions"("tenant_id", "congregation_id", "fitid");

-- AddForeignKey
ALTER TABLE "bank_statement_transactions" ADD CONSTRAINT "bank_statement_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_transactions" ADD CONSTRAINT "bank_statement_transactions_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_transactions" ADD CONSTRAINT "bank_statement_transactions_import_job_id_fkey" FOREIGN KEY ("import_job_id") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_transactions" ADD CONSTRAINT "bank_statement_transactions_financial_transaction_id_fkey" FOREIGN KEY ("financial_transaction_id") REFERENCES "financial_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS — Padrão B (mesmo caso de 20260613000000_add_export_import_jobs):
-- tabela nova, sem policy anterior para derrubar, então não depende da ordem
-- do bootstrap-db.sh (passos 3-6) nem de app_congregation_allowed(), que só
-- existe depois de 003_rls_admin_write.sql (fora do histórico do Prisma).
-- O passo 7 do bootstrap confere de forma genérica que toda tabela em
-- public tem RLS habilitado — não precisa de checagem nomeada própria, como
-- export_jobs/import_jobs também não têm.
ALTER TABLE "bank_statement_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bank_statement_transactions" FORCE ROW LEVEL SECURITY;

CREATE POLICY "bank_statement_transactions_tenant_isolation" ON "bank_statement_transactions"
  USING (
    tenant_id       = current_setting('app.tenant_id', true)
    AND congregation_id = current_setting('app.congregation_id', true)
  )
  WITH CHECK (
    tenant_id       = current_setting('app.tenant_id', true)
    AND congregation_id = current_setting('app.congregation_id', true)
  );
