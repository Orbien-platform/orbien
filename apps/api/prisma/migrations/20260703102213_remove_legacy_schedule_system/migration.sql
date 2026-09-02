-- =============================================================================
-- ORBIEN — remove_legacy_schedule_system
-- Remove o sistema antigo de escalas (sprint 7), consolidando em um único
-- sistema de escala: CelebrationSchedule → CelebrationMinistry →
-- CelebrationAssignment. Sem dados reais em produção neste momento.
--
-- Ordem de DROP respeita as foreign keys (filhas antes das mães):
--   1. volunteer_swap_requests  (referencia schedule_assignments)
--   2. schedule_assignments     (referencia schedule_slots)
--   3. schedule_slots           (referencia service_schedules)
--   4. service_schedules        (referencia ministries)
--   5. assignments              (model órfão, já sem consumidores no código)
--
-- DROP TABLE remove junto, automaticamente: suas próprias foreign keys,
-- índices, constraints e RLS policies definidas na tabela. Não é necessário
-- DROP POLICY/DROP CONSTRAINT em separado.
--
-- Tipos mantidos (usados pelo sistema novo, ver docs/remocao-escala-antiga-plano.md):
--   ScheduleStatus   — usado por CelebrationSchedule
--   AssignmentStatus — usado por CelebrationAssignment
-- Tipo removido (uso exclusivo do sistema antigo):
--   SwapStatus
-- =============================================================================

-- DropTable
DROP TABLE "volunteer_swap_requests";

-- DropTable
DROP TABLE "schedule_assignments";

-- DropTable
DROP TABLE "schedule_slots";

-- DropTable
DROP TABLE "service_schedules";

-- DropTable
DROP TABLE "assignments";

-- DropEnum
DROP TYPE "SwapStatus";
