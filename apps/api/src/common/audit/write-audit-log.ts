import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Grava uma linha de `audit_logs` de dentro de um service, sem deixar a
 * auditoria interferir na operação que ela registra.
 *
 * **Nunca use `prisma.auditLog.create()` para isso.** Toda requisição
 * autenticada roda como `app_user` (o `TenantContextInterceptor` faz
 * `SET LOCAL ROLE app_user`), e `audit_logs` tem uma única policy —
 * `tenant_read`, `FOR SELECT`. Não existe policy de INSERT para esse role: a
 * escrita é reservada a `audit_insert()`, SECURITY DEFINER
 * (`001_rls_setup.sql`, grupo 8).
 *
 * O INSERT direto falha com 42501, e o modo de falha é pior do que parece,
 * porque os dez call sites que este helper substituiu envolviam tudo em
 * `.catch(() => void 0)` e nada chegava a ninguém:
 *
 *   - Com `await` dentro da transação da requisição, o 42501 aborta a
 *     transação inteira no Postgres. O `.catch()` engole o erro, o handler
 *     retorna normalmente e o COMMIT vira ROLLBACK: a rota responde **200** e
 *     a escrita do usuário é descartada em silêncio. Era o caso dos quatro
 *     call sites de `recurring-rule.service.ts` — editar uma transação
 *     recorrente respondia sucesso e não gravava nada.
 *   - Sem `await` (fire-and-forget), a query corre com o COMMIT e perde: o
 *     dado do usuário sobrevive, e só a linha de auditoria some. Era o caso
 *     de `transactions.service.ts`, `pix.service.ts` e
 *     `persons-import.service.ts`.
 *
 * É a quarta vez que este defeito aparece: `AuditInterceptor` (2026-09-03,
 * pendência nº 6), `PersonsService` (2026-09-15, nº 11), e agora estes dez.
 * Por isso virou helper — para que só exista um lugar onde ele pode nascer.
 *
 * **Duas escolhas de desenho, e as duas importam:**
 *
 * 1. **Usa o client BASE, fora da transação da requisição** — como o
 *    `AuditInterceptor`, e ao contrário de `PersonsService.writeAuditLog`.
 *    Não é detalhe: é o que impede uma falha da auditoria de abortar a
 *    transação do handler. Todos os chamadores deste helper têm teste
 *    dizendo que auditoria que falha não desfaz a operação — e era
 *    justamente essa promessa que o INSERT direto quebrava.
 * 2. **Espera (`await`) e trata a falha, em vez de disparar e esquecer.** Sem
 *    o `await` a query corre com o fim da requisição e pode nem chegar ao
 *    banco; sem o tratamento, vira unhandled rejection. Perder a linha em
 *    silêncio foi metade deste defeito.
 *
 * Quem precisa do registro atrelado à transação — para que ele suma se o
 * handler rolar back — é `PersonsService.writeAuditLog`, que usa
 * `prisma.client` e deixa a falha propagar, pelos motivos documentados lá.
 */
export async function writeAuditLog(
  prisma: PrismaService,
  entry: {
    tenant_id: string;
    congregation_id: string | null;
    actor_user_id: string;
    subject_person_id?: string | null;
    entity: string;
    action: string;
    before?: unknown;
    after?: unknown;
  },
  // Obrigatório de propósito: sem um `Logger` do chamador a falha viraria
  // uma linha sem dono no log, e o ponto deste helper é que a falha PAREÇA.
  logger: Logger,
): Promise<void> {
  const before = entry.before === undefined ? null : JSON.stringify(entry.before);
  const after = entry.after === undefined ? null : JSON.stringify(entry.after);

  await prisma.$executeRaw`
    SELECT audit_insert(
      ${entry.tenant_id}::text,
      ${entry.congregation_id}::text,
      ${entry.actor_user_id}::text,
      ${entry.subject_person_id ?? null}::text,
      ${entry.entity}::text,
      ${entry.action}::text,
      ${before}::jsonb,
      ${after}::jsonb,
      NULL::text,
      NULL::text,
      NULL::text
    )
  `.catch((err: unknown) => {
    logger.error(`falha ao registrar ${entry.action} em ${entry.entity}: ${String(err)}`);
  });
}
