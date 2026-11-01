-- Modelo de turmas kids por celebração (kids T10): lista de kids_rooms.id que
-- "Aplicar nas próximas instâncias" abre em lote. Coluna na própria tabela,
-- sem tabela nova: celebrations já tem RLS por congregação, então não há
-- script de RLS a acrescentar.
ALTER TABLE "celebrations" ADD COLUMN "kids_default_room_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
