-- PEND-04: índice de `role_assignments` só por `user_account_id`.
--
-- `auth_session_lookup(id)` (033) roda a cada requisição autenticada (JwtStrategy)
-- e agrega os papéis da conta por `user_account_id`, sem tenant. Os índices
-- existentes começam por `tenant_id` e não servem a esse filtro. EXPLAIN
-- (ANALYZE, BUFFERS) com 130 mil linhas sintéticas: Seq Scan, 8,0 ms, 1 484
-- buffers; com este índice, Index Scan, 0,1 ms, 4 buffers. O custo do seq scan
-- cresce linearmente com a tabela. O `ON DELETE CASCADE` de user_accounts também
-- varria a tabela inteira por conta apagada.
--
-- Migration comum (histórico do Prisma), não script de RLS: índice não muda
-- política nenhuma. Reversível: DROP INDEX "role_assignments_user_account_id_idx".

-- CreateIndex
CREATE INDEX "role_assignments_user_account_id_idx" ON "role_assignments"("user_account_id");
