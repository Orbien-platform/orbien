-- Uma criança só pode ter UM check-in aberto por instância de culto: dois
-- check-ins simultâneos em turmas diferentes do mesmo culto significariam duas
-- turmas achando que a criança está com elas. O índice cobre a criança em
-- qualquer turma da instância (celebration_instance_id é desnormalizado em
-- kids_checkins, preso à sessão por FK composta). O Prisma não modela índice
-- parcial — mesmo caso de assignment_swap_requests_one_pending_per_assignment.
-- Violação vira 409 "Esta criança já está presente" no serviço.
CREATE UNIQUE INDEX "kids_checkins_one_open_per_child_and_instance"
  ON "kids_checkins"("child_id", "celebration_instance_id")
  WHERE "checked_out_at" IS NULL;
