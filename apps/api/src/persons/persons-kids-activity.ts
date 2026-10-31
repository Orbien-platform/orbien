import { Prisma } from '@prisma/client';

/**
 * REV-1: sinal de atividade do Kids para a retenção por inatividade.
 *
 * Definição mínima: o check-in mais recente de Kids em que a pessoa aparece
 * como responsável do check-in (`guardian_person_id`), como quem retirou
 * (`picked_up_by_person_id`) ou é `KidsGuardian` da criança do check-in. Sem
 * nenhum, cai em `created_at` (neutro no GREATEST). Responsável que só usa o
 * Kids não mexe no próprio cadastro nem registra visita/presença; sem isto
 * seria anonimizado enquanto o filho segue frequentando.
 *
 * `personAlias` é o alias de `persons` na consulta chamadora (valor fixo do
 * código, nunca entrada do usuário).
 */
export function kidsActivitySignal(personAlias = 'p'): Prisma.Sql {
  const p = Prisma.raw(personAlias);
  return Prisma.sql`COALESCE((
    SELECT MAX(kc.checked_in_at)
    FROM kids_checkins kc
    WHERE kc.guardian_person_id = ${p}.id
       OR kc.picked_up_by_person_id = ${p}.id
       OR kc.child_id IN (SELECT kg.child_id FROM kids_guardians kg WHERE kg.guardian_person_id = ${p}.id)
  ), ${p}.created_at)`;
}
