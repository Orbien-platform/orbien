-- Pedido de troca de escala (v2, "Minhas escalas" → Trocas).
-- Tabela nova: nasce sem RLS aqui e recebe a policy de congregação em
-- 025_rls_assignment_swap_requests.sql (fora do histórico do Prisma, aplicado
-- pelo bootstrap-db.sh).
-- CreateEnum
CREATE TYPE "SwapRequestStatus" AS ENUM ('pending', 'accepted', 'declined', 'cancelled');

-- CreateTable
CREATE TABLE "assignment_swap_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "congregation_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "requester_profile_id" TEXT NOT NULL,
    "target_profile_id" TEXT,
    "accepted_by_profile_id" TEXT,
    "status" "SwapRequestStatus" NOT NULL DEFAULT 'pending',
    "message" VARCHAR(280),
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignment_swap_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assignment_swap_requests_congregation_id_idx" ON "assignment_swap_requests"("congregation_id");

-- CreateIndex
CREATE INDEX "assignment_swap_requests_assignment_id_status_idx" ON "assignment_swap_requests"("assignment_id", "status");

-- CreateIndex
CREATE INDEX "assignment_swap_requests_requester_profile_id_idx" ON "assignment_swap_requests"("requester_profile_id");

-- CreateIndex
CREATE INDEX "assignment_swap_requests_target_profile_id_status_idx" ON "assignment_swap_requests"("target_profile_id", "status");

-- AddForeignKey
ALTER TABLE "assignment_swap_requests" ADD CONSTRAINT "assignment_swap_requests_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "celebration_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_swap_requests" ADD CONSTRAINT "assignment_swap_requests_requester_profile_id_fkey" FOREIGN KEY ("requester_profile_id") REFERENCES "volunteer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_swap_requests" ADD CONSTRAINT "assignment_swap_requests_target_profile_id_fkey" FOREIGN KEY ("target_profile_id") REFERENCES "volunteer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_swap_requests" ADD CONSTRAINT "assignment_swap_requests_accepted_by_profile_id_fkey" FOREIGN KEY ("accepted_by_profile_id") REFERENCES "volunteer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- No máximo um pedido em aberto por atribuição: dois pedidos simultâneos para
-- a mesma escala deixariam dois colegas aceitarem a mesma vaga. O Prisma não
-- modela índice parcial.
CREATE UNIQUE INDEX "assignment_swap_requests_one_pending_per_assignment"
  ON "assignment_swap_requests"("assignment_id")
  WHERE "status" = 'pending';
