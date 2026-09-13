-- DropIndex
DROP INDEX "user_accounts_tenant_id_email_key";

-- CreateIndex
CREATE UNIQUE INDEX "user_accounts_email_key" ON "user_accounts"("email");

