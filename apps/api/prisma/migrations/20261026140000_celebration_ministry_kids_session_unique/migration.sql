-- Escala por sessão kids (kids T21): o mesmo ministério "Kids" precisa escalar
-- N turmas da mesma instância, uma CelebrationMinistry por (escala, sessão).
-- A unicidade (schedule_id, ministry_id) vira dois índices parciais:
--   * sem sessão kids: um ministério por escala, como sempre foi;
--   * com sessão kids: um ministério por (escala, sessão).
-- O Prisma não modela índice parcial — mesmo caso de
-- kids_checkins_one_open_per_child_and_instance. Violação vira 409 no serviço.
DROP INDEX "celebration_ministries_schedule_id_ministry_id_key";

CREATE UNIQUE INDEX "celebration_ministries_schedule_ministry_no_session_key"
  ON "celebration_ministries"("schedule_id", "ministry_id")
  WHERE "kids_session_id" IS NULL;

CREATE UNIQUE INDEX "celebration_ministries_schedule_ministry_session_key"
  ON "celebration_ministries"("schedule_id", "ministry_id", "kids_session_id")
  WHERE "kids_session_id" IS NOT NULL;
