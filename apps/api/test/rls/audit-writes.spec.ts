/**
 * RLS — escrita de auditoria de dentro de um service
 *
 * `audit_logs` tem UMA policy: `tenant_read`, `FOR SELECT`, para `app_user`.
 * Não há policy de INSERT para esse role — a escrita é reservada a
 * `audit_insert()`, SECURITY DEFINER (`001_rls_setup.sql`, grupo 8). E toda
 * requisição autenticada roda como `app_user`, porque o
 * `TenantContextInterceptor` faz `SET LOCAL ROLE app_user`.
 *
 * O defeito que este arquivo tranca já apareceu quatro vezes — no
 * `AuditInterceptor` (pendência nº 6), no `PersonsService` (nº 11) e nos dez
 * call sites de financeiro/importação que `writeAuditLog` substituiu. Ele
 * reaparece porque o INSERT direto **não faz barulho**: os call sites o
 * envolviam em `.catch(() => void 0)`, e o que restava era ou uma linha de
 * auditoria faltando, ou — pior — a escrita do usuário sumindo com a rota
 * respondendo 200.
 *
 * Os dois primeiros testes medem o mecanismo cru, sem passar por service
 * nenhum: é o que garante que a conclusão vale para qualquer call site
 * futuro, e não só para os que existem hoje.
 */

import { Prisma } from '@prisma/client';
import { prismaAdmin, prisma, ensureRole } from '../helpers/rls';

const ts = Date.now();

let tenantId: string;
let congregationId: string;
let userId: string;
let categoryId: string;

/** Espelha o TenantContextInterceptor: troca de role + contexto, numa transação. */
async function comoRequisicao<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE app_user');
      await tx.$executeRaw`
        SELECT set_config('app.tenant_id',        ${tenantId},       true),
               set_config('app.congregation_id',  ${congregationId}, true),
               set_config('app.user_id',          ${userId},         true),
               set_config('app.role_codes',       'treasurer',       true)
      `;
      return fn(tx);
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

beforeAll(async () => {
  await ensureRole(prismaAdmin, 'treasurer', 'Tesoureiro');

  const tenant = await prismaAdmin.tenant.create({
    data: { slug: `auditw-${ts}`, name: 'Tenant (escrita de auditoria)' },
  });
  tenantId = tenant.id;
  const cong = await prismaAdmin.congregation.create({
    data: { tenant_id: tenantId, name: 'Sede' },
  });
  congregationId = cong.id;
  const user = await prismaAdmin.userAccount.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      email: `auditw-${ts}@teste.test`,
      password_hash: 'hash',
    },
  });
  userId = user.id;
  await prismaAdmin.roleAssignment.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      user_account_id: userId,
      role_code: 'treasurer',
    },
  });
  const cat = await prismaAdmin.financialCategory.create({
    data: { tenant_id: tenantId, congregation_id: congregationId, name: 'Dízimos', type: 'income' },
  });
  categoryId = cat.id;
}, 60_000);

afterAll(async () => {
  // Ordem explícita: `AuditLog.actorUser` é onDelete: Restrict.
  await prismaAdmin.auditLog.deleteMany({ where: { tenant_id: tenantId } });
  await prismaAdmin.financialTransaction.deleteMany({ where: { tenant_id: tenantId } });
  await prismaAdmin.roleAssignment.deleteMany({ where: { tenant_id: tenantId } });
  await prismaAdmin.userAccount.deleteMany({ where: { id: userId } });
  await prismaAdmin.tenant.delete({ where: { id: tenantId } });
  await prismaAdmin.$disconnect();
  await prisma.$disconnect();
}, 30_000);

describe('audit_logs — a escrita só existe por audit_insert()', () => {
  it('INSERT direto como app_user é negado com 42501', async () => {
    // O controle negativo do arquivo inteiro. Se um dia isto passar a
    // funcionar, alguém abriu uma policy de INSERT para `app_user` — e os
    // outros testes daqui deixam de significar o que dizem significar.
    await expect(
      comoRequisicao((tx) =>
        tx.auditLog.create({
          data: {
            tenant_id: tenantId,
            congregation_id: congregationId,
            actor_user_id: userId,
            entity: 'probe',
            action: 'created',
          },
        }),
      ),
    ).rejects.toThrow(/42501|row-level security/);
  });

  it('o INSERT negado aborta a transação e descarta a escrita do usuário', async () => {
    // É este o comportamento que fazia a rota responder 200 sem gravar nada:
    // o 42501 aborta a transação no Postgres, o `.catch()` engole o erro, o
    // handler retorna normalmente e o COMMIT vira ROLLBACK.
    const trx = await prismaAdmin.financialTransaction.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        category_id: categoryId,
        type: 'income',
        amount: '100.00',
        occurred_at: new Date(),
        source: 'manual',
        created_by_user_id: userId,
      },
    });

    await comoRequisicao(async (tx) => {
      await tx.financialTransaction.update({
        where: { id: trx.id },
        data: { amount: '999.00' },
      });

      await tx.auditLog
        .create({
          data: {
            tenant_id: tenantId,
            congregation_id: congregationId,
            actor_user_id: userId,
            entity: 'financial_transaction',
            action: 'updated',
          },
        })
        .catch(() => void 0); // exatamente o que os call sites faziam
    });

    const depois = await prismaAdmin.financialTransaction.findUnique({ where: { id: trx.id } });
    expect(depois?.amount.toString()).toBe('100'); // a edição para 999 sumiu
  });

  it('audit_insert() grava como app_user, dentro da mesma transação', async () => {
    await comoRequisicao(
      (tx) => tx.$executeRaw`
        SELECT audit_insert(
          ${tenantId}::text, ${congregationId}::text, ${userId}::text, NULL::text,
          'financial_transaction'::text, 'created'::text,
          NULL::jsonb, ${JSON.stringify({ amount: '100.00' })}::jsonb,
          NULL::text, NULL::text, NULL::text
        )
      `,
    );

    const row = await prismaAdmin.auditLog.findFirst({
      where: { tenant_id: tenantId, entity: 'financial_transaction', action: 'created' },
    });
    expect(row).not.toBeNull();
    expect(row?.after).toEqual({ amount: '100.00' });
  });

  it('a linha de auditoria acompanha o rollback do handler', async () => {
    // O contrapeso de ser transacional: `audit_insert()` é SECURITY DEFINER,
    // o que muda o privilégio, não o escopo da transação. Se o handler falhar
    // depois de registrar, não pode sobrar linha dizendo que a mudança
    // aconteceu. Quem quer registro que sobrevive ao rollback é o
    // `AuditInterceptor`, que roda fora da transação de propósito.
    const antes = await prismaAdmin.auditLog.count({ where: { tenant_id: tenantId } });

    await expect(
      comoRequisicao(async (tx) => {
        await tx.$executeRaw`
          SELECT audit_insert(
            ${tenantId}::text, ${congregationId}::text, ${userId}::text, NULL::text,
            'financial_transaction'::text, 'deleted'::text,
            NULL::jsonb, NULL::jsonb, NULL::text, NULL::text, NULL::text
          )
        `;
        throw new Error('handler falhou depois de registrar');
      }),
    ).rejects.toThrow('handler falhou depois de registrar');

    expect(await prismaAdmin.auditLog.count({ where: { tenant_id: tenantId } })).toBe(antes);
  });
});

describe('nenhum service escreve em audit_logs por auditLog.create()', () => {
  it('nenhum arquivo de src/ chama um método de escrita em auditLog', async () => {
    // O teste que impede a quinta reincidência. Os de cima provam que o
    // INSERT direto não funciona; este prova que ninguém voltou a escrevê-lo
    // — que é a parte que revisão humana deixou passar quatro vezes.
    //
    // A varredura normaliza o espaço em branco antes de casar, de propósito:
    // a forma que os dez call sites usavam quebrava a linha entre `auditLog`
    // e `.create(`, e é justamente por isso que um `grep "auditLog.create"`
    // ingênuo não os encontrava.
    //
    // Leitura (`findMany`, `count`, `findFirst`) fica de fora: a policy
    // `tenant_read` cobre, e é o que `list-audit-logs.service.ts` e
    // `tenant-audit-logs.service.ts` fazem.
    const { readdir, readFile } = await import('fs/promises');
    const { join } = await import('path');

    async function arquivosTs(dir: string): Promise<string[]> {
      const entradas = await readdir(dir, { withFileTypes: true });
      const saida: string[] = [];
      for (const e of entradas) {
        const caminho = join(dir, e.name);
        if (e.isDirectory()) saida.push(...(await arquivosTs(caminho)));
        else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) saida.push(caminho);
      }
      return saida;
    }

    const escrita = /auditLog\s*\.\s*(create|createMany|upsert|update|updateMany|delete|deleteMany)\b/;
    const culpados: string[] = [];

    for (const arquivo of await arquivosTs(join(process.cwd(), 'src'))) {
      const conteudo = await readFile(arquivo, 'utf8');
      // O comentário de `write-audit-log.ts` cita o padrão proibido para
      // explicá-lo; não é chamada.
      const semComentarios = conteudo
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*/g, '');
      if (escrita.test(semComentarios)) culpados.push(arquivo.replace(process.cwd() + '/', ''));
    }

    expect(culpados).toEqual([]);
  });
});
