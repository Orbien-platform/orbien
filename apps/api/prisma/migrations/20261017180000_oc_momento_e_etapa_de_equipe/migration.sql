-- OC: momento da etapa (antes/durante/depois do culto) e etapa de equipe
-- (logística ligada à escala). Linhas existentes seguem como programa, durante.
CREATE TYPE "ServiceOrderPhase" AS ENUM ('before', 'during', 'after');
CREATE TYPE "ServiceOrderEntryKind" AS ENUM ('program', 'logistics');

ALTER TABLE "service_order_items"
  ADD COLUMN "phase" "ServiceOrderPhase" NOT NULL DEFAULT 'during',
  ADD COLUMN "entry_kind" "ServiceOrderEntryKind" NOT NULL DEFAULT 'program';
