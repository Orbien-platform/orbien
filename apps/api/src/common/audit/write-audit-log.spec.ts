import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { writeAuditLog } from './write-audit-log';

/**
 * O helper é o ponto único de escrita de auditoria a partir de um service —
 * por isso tem spec próprio, e não só a cobertura de tabela que vem dos
 * quatro serviços que o chamam. O que importa aqui é o contrato: por onde
 * escreve, e o que faz quando falha.
 *
 * Que a escrita direta em `audit_logs` é recusada pelo RLS, e que este
 * caminho funciona, quem mede é `test/rls/audit-writes.spec.ts`, contra o
 * Postgres. Mock nenhum provaria isso — foi exatamente um mock que deixou o
 * defeito passar quinze dias.
 */
function harness(opts: { rejeita?: Error } = {}) {
  const executeRaw = jest.fn(() =>
    opts.rejeita ? Promise.reject(opts.rejeita) : Promise.resolve(1),
  );
  // `client` existe para provar que NÃO é por ele que a escrita vai: se
  // alguém trocar `prisma.$executeRaw` por `prisma.client.$executeRaw`, a
  // auditoria volta para dentro da transação da requisição e volta a poder
  // abortá-la.
  const clientExecuteRaw = jest.fn(() => Promise.resolve(1));
  const prisma = {
    $executeRaw: executeRaw,
    client: { $executeRaw: clientExecuteRaw },
  } as unknown as PrismaService;
  const logger = { error: jest.fn() } as unknown as Logger;
  return { prisma, logger, executeRaw, clientExecuteRaw };
}

const ENTRADA = {
  tenant_id: 't1',
  congregation_id: 'c1',
  actor_user_id: 'u1',
  entity: 'financial_transaction',
  action: 'created',
};

/** Posição dos valores no template de `audit_insert()`. */
const P = {
  tenant_id: 1,
  congregation_id: 2,
  actor_user_id: 3,
  subject_person_id: 4,
  entity: 5,
  action: 6,
  before: 7,
  after: 8,
} as const;

describe('writeAuditLog', () => {
  it('escreve pelo client BASE, nunca pelo da transação', async () => {
    const { prisma, logger, executeRaw, clientExecuteRaw } = harness();

    await writeAuditLog(prisma, ENTRADA, logger);

    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(clientExecuteRaw).not.toHaveBeenCalled();
  });

  it('chama audit_insert() com os valores na ordem da função', async () => {
    const { prisma, logger, executeRaw } = harness();

    await writeAuditLog(
      prisma,
      { ...ENTRADA, subject_person_id: 'p1', before: { amount: '1' }, after: { amount: '2' } },
      logger,
    );

    const [sql, ...valores] = executeRaw.mock.calls[0] as unknown as [string[], ...unknown[]];
    expect(sql.join('?')).toContain('audit_insert');
    expect(valores[P.tenant_id - 1]).toBe('t1');
    expect(valores[P.congregation_id - 1]).toBe('c1');
    expect(valores[P.actor_user_id - 1]).toBe('u1');
    expect(valores[P.subject_person_id - 1]).toBe('p1');
    expect(valores[P.entity - 1]).toBe('financial_transaction');
    expect(valores[P.action - 1]).toBe('created');
  });

  it('serializa before e after como JSON — a coluna é jsonb', async () => {
    const { prisma, logger, executeRaw } = harness();

    await writeAuditLog(prisma, { ...ENTRADA, before: { a: 1 }, after: { b: 2 } }, logger);

    const valores = (executeRaw.mock.calls[0] as unknown[]).slice(1);
    expect(valores[P.before - 1]).toBe('{"a":1}');
    expect(valores[P.after - 1]).toBe('{"b":2}');
  });

  it('manda NULL onde o chamador não informou — ausente não vira "undefined"', async () => {
    // Uma exclusão informa `before` e não `after`; `JSON.stringify(undefined)`
    // devolve `undefined`, que viraria jsonb inválido.
    const { prisma, logger, executeRaw } = harness();

    await writeAuditLog(prisma, { ...ENTRADA, before: { a: 1 } }, logger);

    const valores = (executeRaw.mock.calls[0] as unknown[]).slice(1);
    expect(valores[P.subject_person_id - 1]).toBeNull();
    expect(valores[P.after - 1]).toBeNull();
  });

  it('`subject_person_id: null` explícito também vira NULL', async () => {
    const { prisma, logger, executeRaw } = harness();

    await writeAuditLog(prisma, { ...ENTRADA, subject_person_id: null }, logger);

    expect((executeRaw.mock.calls[0] as unknown[])[P.subject_person_id]).toBeNull();
  });

  it('falha não propaga, e é logada — auditoria não derruba a operação', async () => {
    // O contrato que os quatro serviços chamadores têm em teste. Antes, a
    // falha era engolida sem log nenhum, e foi assim que quinze dias de
    // auditoria sumiram sem ninguém ver.
    const { prisma, logger } = harness({ rejeita: new Error('banco fora do ar') });

    await expect(writeAuditLog(prisma, ENTRADA, logger)).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('falha ao registrar created em financial_transaction'),
    );
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('banco fora do ar'));
  });
});
