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

-- RLS: ver prisma/migrations/019_rls_bank_statement_transactions.sql, fora do
-- histórico do Prisma e aplicado pelo bootstrap-db.sh — padrão do resto do
-- produto, em vez de policy definida junto com esta migration.
