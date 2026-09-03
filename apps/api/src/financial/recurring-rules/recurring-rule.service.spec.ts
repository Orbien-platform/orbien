/**
 * Regra recorrente é o serviço que MULTIPLICA erro: uma regra de 12 parcelas
 * cria 12 lançamentos de uma vez, e um mês errado no meio da série só aparece
 * quando o tesoureiro fecha o DRE.
 *
 * O centro de gravidade é o `addMonths` no topo do arquivo. Ele saturava? Não:
 * era `setMonth`, que transbordava — 31/01 + 1 mês virava 03/03, e fevereiro
 * ficava sem parcela. Passou a saturar no último dia do mês de destino, e é
 * isso que os testes de calendário abaixo exigem.
 *
 * A conta é em UTC. Os testes usam horário 12:00Z de propósito: assim a data
 * é a mesma em qualquer fuso plausível e a suíte não fica verde no CI (UTC) e
 * vermelha no laptop (-03).
 */

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  RecurringFrequency,
  RecurringRuleMode,
  TransactionType,
} from '@prisma/client';
import { RecurringRuleService, RecurringScope } from './recurring-rule.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { CreateRecurringRuleDto } from './dto/create-recurring-rule.dto';
import { UpdateTransactionDto } from '../dto/update-transaction.dto';

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 't1',
  congregation_id: 'c1',
  roles: ['treasurer'],
  plan: 'premium',
};

const dtoBase: CreateRecurringRuleDto = {
  mode: RecurringRuleMode.fixed,
  frequency: RecurringFrequency.monthly,
  amount: 100,
  type: TransactionType.expense,
  category_id: 'cat-1',
  description: 'Aluguel',
};

type Captured = {
  rules: Record<string, unknown>[];
  transactions: Record<string, unknown>[];
  updates: { model: string; args: Record<string, unknown> }[];
  audits: Record<string, unknown>[];
  deletes: { model: string; args: Record<string, unknown> }[];
};

function harness(opts: {
  category?: { id: string; type: string } | null;
  rule?: Record<string, unknown> | null;
  transaction?: Record<string, unknown> | null;
  lastTransaction?: Record<string, unknown> | null;
  rules?: Record<string, unknown>[];
  updateManyCount?: number;
  deleteManyCount?: number;
  auditThrows?: boolean;
}) {
  const cap: Captured = {
    rules: [],
    transactions: [],
    updates: [],
    audits: [],
    deletes: [],
  };

  const tx = {
    recurringRule: {
      create: (args: { data: Record<string, unknown> }) => {
        cap.rules.push(args.data);
        return Promise.resolve({ id: 'rule-1', ...args.data });
      },
      update: (args: Record<string, unknown>) => {
        cap.updates.push({ model: 'recurringRule', args });
        return Promise.resolve({ id: 'rule-1', ...args });
      },
    },
    financialTransaction: {
      create: (args: { data: Record<string, unknown> }) => {
        cap.transactions.push(args.data);
        return Promise.resolve({ id: `tx-${cap.transactions.length}`, ...args.data });
      },
      update: (args: Record<string, unknown>) => {
        cap.updates.push({ model: 'financialTransaction', args });
        return Promise.resolve({ id: 'tx-1', ...args });
      },
      updateMany: (args: Record<string, unknown>) => {
        cap.updates.push({ model: 'updateMany', args });
        return Promise.resolve({ count: opts.updateManyCount ?? 3 });
      },
      delete: (args: Record<string, unknown>) => {
        cap.deletes.push({ model: 'delete', args });
        return Promise.resolve({ id: 'tx-1', deleted: true });
      },
      deleteMany: (args: Record<string, unknown>) => {
        cap.deletes.push({ model: 'deleteMany', args });
        return Promise.resolve({ count: opts.deleteManyCount ?? 2 });
      },
    },
    auditLog: {
      create: (args: { data: Record<string, unknown> }) => {
        if (opts.auditThrows) return Promise.reject(new Error('audit fora do ar'));
        cap.audits.push(args.data);
        return Promise.resolve({});
      },
    },
  };

  const prisma = {
    client: {
      financialCategory: {
        findFirst: () =>
          Promise.resolve(opts.category === undefined ? { id: 'cat-1', type: 'expense' } : opts.category),
      },
      recurringRule: {
        findMany: () => Promise.resolve(opts.rules ?? []),
        findFirst: () => Promise.resolve(opts.rule === undefined ? { id: 'rule-1' } : opts.rule),
        update: (args: Record<string, unknown>) => {
          cap.updates.push({ model: 'recurringRule', args });
          return Promise.resolve({ id: 'rule-1', is_active: false });
        },
      },
      financialTransaction: {
        findFirst: () =>
          Promise.resolve(
            opts.transaction === undefined
              ? { id: 'tx-1', status: 'pending', type: 'expense', category_id: 'cat-1' }
              : opts.transaction,
          ),
      },
    },
    system: {
      recurringRule: {
        findUnique: () => Promise.resolve(opts.rule === undefined ? null : opts.rule),
      },
      financialTransaction: {
        findFirst: () => Promise.resolve(opts.lastTransaction ?? null),
      },
      $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    },
    runInTx: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  } as unknown as PrismaService;

  return { service: new RecurringRuleService(prisma), cap };
}

describe('RecurringRuleService', () => {
  describe('create — validação antes de gravar', () => {
    it('categoria inexistente vira 404', async () => {
      const { service } = harness({ category: null });

      await expect(service.create(dtoBase, user)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('tipo do lançamento diferente do tipo da categoria vira 400', async () => {
      const { service } = harness({ category: { id: 'cat-1', type: 'income' } });

      await expect(service.create(dtoBase, user)).rejects.toThrow(
        'Tipo do lançamento (expense) não corresponde ao tipo da categoria (income)',
      );
    });

    it('modo installment sem número de parcelas vira 400', async () => {
      const { service } = harness({});

      await expect(
        service.create({ ...dtoBase, mode: RecurringRuleMode.installment }, user),
      ).rejects.toThrow('Número de parcelas é obrigatório para o modo installment');
    });

    it('não grava nada quando a validação falha', async () => {
      const { service, cap } = harness({ category: null });

      await expect(service.create(dtoBase, user)).rejects.toThrow();
      expect(cap.rules).toEqual([]);
      expect(cap.transactions).toEqual([]);
    });
  });

  describe('create — modo installment', () => {
    const parcelado: CreateRecurringRuleDto = {
      ...dtoBase,
      mode: RecurringRuleMode.installment,
      installments: 3,
      started_at: '2026-01-15T12:00:00.000Z',
    };

    it('cria uma transação por parcela, com a numeração na descrição', async () => {
      const { service, cap } = harness({});

      await service.create(parcelado, user);

      expect(cap.transactions).toHaveLength(3);
      expect(cap.transactions.map((t) => t['description'])).toEqual([
        'Aluguel (1/3)',
        'Aluguel (2/3)',
        'Aluguel (3/3)',
      ]);
    });

    it('a primeira parcela cai na data de início e as seguintes de mês em mês', async () => {
      const { service, cap } = harness({});

      await service.create(parcelado, user);

      expect(cap.transactions.map((t) => (t['occurred_at'] as Date).toISOString())).toEqual([
        '2026-01-15T12:00:00.000Z',
        '2026-02-15T12:00:00.000Z',
        '2026-03-15T12:00:00.000Z',
      ]);
    });

    it('a regra termina na última parcela — `ends_at` e `next_occurrence_at` iguais', async () => {
      const { service, cap } = harness({});

      await service.create(parcelado, user);

      const regra = cap.rules[0]!;
      expect((regra['ends_at'] as Date).toISOString()).toBe('2026-03-15T12:00:00.000Z');
      expect(regra['next_occurrence_at']).toEqual(regra['ends_at']);
      expect(regra['installments']).toBe(3);
    });

    it('marca as parcelas como `source: recurring` e amarra na regra', async () => {
      const { service, cap } = harness({});

      await service.create(parcelado, user);

      for (const t of cap.transactions) {
        expect(t['source']).toBe('recurring');
        expect(t['recurring_rule_id']).toBe('rule-1');
        expect(t['created_by_user_id']).toBe('user-1');
        expect(t['tenant_id']).toBe('t1');
        expect(t['congregation_id']).toBe('c1');
      }
    });

    it('o valor vira Decimal, não float', async () => {
      const { service, cap } = harness({});

      await service.create({ ...parcelado, amount: 1234.56 }, user);

      expect(cap.transactions[0]?.['amount']).toBeInstanceOf(Prisma.Decimal);
      expect(String(cap.transactions[0]?.['amount'])).toBe('1234.56');
    });

    it('parcela do dia 31 satura em 28/02 e volta ao dia 31 em março', async () => {
      // O caso que motivou a correção. Com `setMonth`, a segunda parcela caía
      // em 03/03: fevereiro ficava sem parcela e março recebia duas. Como cada
      // parcela é calculada a partir da ÂNCORA (`started_at`), saturar em
      // fevereiro não desloca as parcelas seguintes — março volta ao dia 31.
      const { service, cap } = harness({});

      await service.create(
        { ...parcelado, started_at: '2026-01-31T12:00:00.000Z' },
        user,
      );

      expect(cap.transactions.map((t) => (t['occurred_at'] as Date).toISOString())).toEqual([
        '2026-01-31T12:00:00.000Z',
        '2026-02-28T12:00:00.000Z',
        '2026-03-31T12:00:00.000Z',
      ]);
    });

    it('parcela do dia 30 também satura em 28/02', async () => {
      const { service, cap } = harness({});

      await service.create(
        { ...parcelado, installments: 2, started_at: '2026-01-30T12:00:00.000Z' },
        user,
      );

      expect(cap.transactions.map((t) => (t['occurred_at'] as Date).toISOString())).toEqual([
        '2026-01-30T12:00:00.000Z',
        '2026-02-28T12:00:00.000Z',
      ]);
    });

    it('em ano bissexto, satura em 29/02', async () => {
      // 2028 é bissexto. Prende que o limite vem do calendário real e não de
      // um 28 fixo no código.
      const { service, cap } = harness({});

      await service.create(
        { ...parcelado, installments: 2, started_at: '2028-01-30T12:00:00.000Z' },
        user,
      );

      expect(cap.transactions.map((t) => (t['occurred_at'] as Date).toISOString())).toEqual([
        '2028-01-30T12:00:00.000Z',
        '2028-02-29T12:00:00.000Z',
      ]);
    });

    it('série de 13 parcelas do dia 31 satura em cada mês curto', async () => {
      // Varre um ano inteiro a partir de 31/01: fevereiro, abril, junho,
      // setembro e novembro são curtos, e cada um recebe o próprio último dia.
      // Nenhum mês fica sem parcela e nenhum recebe duas.
      const { service, cap } = harness({});

      await service.create(
        { ...parcelado, installments: 13, started_at: '2026-01-31T12:00:00.000Z' },
        user,
      );

      expect(
        cap.transactions.map((t) => (t['occurred_at'] as Date).toISOString().slice(0, 10)),
      ).toEqual([
        '2026-01-31',
        '2026-02-28',
        '2026-03-31',
        '2026-04-30',
        '2026-05-31',
        '2026-06-30',
        '2026-07-31',
        '2026-08-31',
        '2026-09-30',
        '2026-10-31',
        '2026-11-30',
        '2026-12-31',
        '2027-01-31',
      ]);
    });

    it('a hora do dia é preservada na saturação', async () => {
      const { service, cap } = harness({});

      await service.create(
        { ...parcelado, installments: 2, started_at: '2026-01-31T08:45:30.123Z' },
        user,
      );

      expect((cap.transactions[1]?.['occurred_at'] as Date).toISOString()).toBe(
        '2026-02-28T08:45:30.123Z',
      );
    });

    it('série que atravessa a virada de ano continua correta', async () => {
      const { service, cap } = harness({});

      await service.create(
        { ...parcelado, installments: 3, started_at: '2026-11-10T12:00:00.000Z' },
        user,
      );

      expect(cap.transactions.map((t) => (t['occurred_at'] as Date).toISOString())).toEqual([
        '2026-11-10T12:00:00.000Z',
        '2026-12-10T12:00:00.000Z',
        '2027-01-10T12:00:00.000Z',
      ]);
    });
  });

  describe('create — modo fixed', () => {
    const fixo: CreateRecurringRuleDto = {
      ...dtoBase,
      mode: RecurringRuleMode.fixed,
      started_at: '2026-01-15T12:00:00.000Z',
    };

    it('cria uma transação só, na data de início', async () => {
      const { service, cap } = harness({});

      await service.create(fixo, user);

      expect(cap.transactions).toHaveLength(1);
      expect((cap.transactions[0]?.['occurred_at'] as Date).toISOString()).toBe(
        '2026-01-15T12:00:00.000Z',
      );
      expect(cap.transactions[0]?.['description']).toBe('Aluguel');
    });

    it('a regra fica aberta: `installments` e `ends_at` nulos', async () => {
      const { service, cap } = harness({});

      await service.create(fixo, user);

      const regra = cap.rules[0]!;
      expect(regra['installments']).toBeNull();
      expect(regra['ends_at']).toBeNull();
      expect(regra['is_active']).toBe(true);
    });

    it('a próxima ocorrência é um mês depois do início', async () => {
      const { service, cap } = harness({});

      await service.create(fixo, user);

      expect((cap.rules[0]?.['next_occurrence_at'] as Date).toISOString()).toBe(
        '2026-02-15T12:00:00.000Z',
      );
    });

    it('sem `started_at`, usa a hora corrente', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-10T12:00:00.000Z'));
      try {
        const { service, cap } = harness({});

        await service.create({ ...dtoBase }, user);

        expect((cap.transactions[0]?.['occurred_at'] as Date).toISOString()).toBe(
          '2026-06-10T12:00:00.000Z',
        );
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('findAll', () => {
    it('achata o `_count` do Prisma em `transactions_count`', async () => {
      const { service } = harness({
        rules: [
          { id: 'r1', description: 'A', _count: { transactions: 12 } },
          { id: 'r2', description: 'B', _count: { transactions: 0 } },
        ],
      });

      const rules = await service.findAll(user);

      expect(rules).toEqual([
        { id: 'r1', description: 'A', transactions_count: 12 },
        { id: 'r2', description: 'B', transactions_count: 0 },
      ]);
      // O `_count` não deve vazar para a resposta da API.
      expect(rules[0]).not.toHaveProperty('_count');
    });

    it('sem regra nenhuma devolve lista vazia', async () => {
      const { service } = harness({ rules: [] });

      await expect(service.findAll(user)).resolves.toEqual([]);
    });
  });

  describe('deactivate', () => {
    it('desativa em vez de apagar — o histórico das transações fica', async () => {
      const { service, cap } = harness({ rule: { id: 'rule-1' } });

      await service.deactivate('rule-1', user);

      expect(cap.updates).toEqual([
        { model: 'recurringRule', args: { where: { id: 'rule-1' }, data: { is_active: false } } },
      ]);
    });

    it('regra de outro tenant vira 404, não 403', async () => {
      // O `findFirst` já filtra por tenant e congregação, então uma regra de
      // outra igreja é indistinguível de inexistente. É o comportamento certo:
      // não confirma a existência do recurso para quem não pode vê-lo.
      const { service } = harness({ rule: null });

      await expect(service.deactivate('rule-de-outro', user)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('generateNext', () => {
    const regraFixa = {
      id: 'rule-1',
      tenant_id: 't1',
      congregation_id: 'c1',
      is_active: true,
      mode: RecurringRuleMode.fixed,
      next_occurrence_at: new Date('2026-02-15T12:00:00.000Z'),
    };

    const ultima = {
      id: 'tx-antiga',
      type: 'expense',
      amount: new Prisma.Decimal('100'),
      description: 'Aluguel',
      category_id: 'cat-1',
      notes: 'nota antiga',
      created_by_user_id: 'user-1',
    };

    it('copia a última transação para a data da próxima ocorrência', async () => {
      const { service, cap } = harness({ rule: regraFixa, lastTransaction: ultima });

      await service.generateNext('rule-1');

      expect(cap.transactions).toHaveLength(1);
      const nova = cap.transactions[0]!;
      expect((nova['occurred_at'] as Date).toISOString()).toBe('2026-02-15T12:00:00.000Z');
      expect(nova['description']).toBe('Aluguel');
      expect(nova['notes']).toBe('nota antiga');
      expect(nova['created_by_user_id']).toBe('user-1');
      expect(nova['source']).toBe('recurring');
    });

    it('avança `next_occurrence_at` em um mês', async () => {
      const { service, cap } = harness({ rule: regraFixa, lastTransaction: ultima });

      await service.generateNext('rule-1');

      const update = cap.updates.find((u) => u.model === 'recurringRule')!;
      const data = (update.args as { data: { next_occurrence_at: Date } }).data;
      expect(data.next_occurrence_at.toISOString()).toBe('2026-03-15T12:00:00.000Z');
    });

    it('regra do dia 31 avança saturando em 28/02', async () => {
      const { service, cap } = harness({
        rule: { ...regraFixa, next_occurrence_at: new Date('2026-01-31T12:00:00.000Z') },
        lastTransaction: ultima,
      });

      await service.generateNext('rule-1');

      const update = cap.updates.find((u) => u.model === 'recurringRule')!;
      const data = (update.args as { data: { next_occurrence_at: Date } }).data;
      expect(data.next_occurrence_at.toISOString()).toBe('2026-02-28T12:00:00.000Z');
    });

    it('LIMITAÇÃO CONHECIDA: no modo fixed o dia original não volta depois de saturar', async () => {
      // Diferente de `create`, o `generateNext` soma a partir do
      // `next_occurrence_at` gravado, não de uma âncora. Depois de saturar em
      // 28/02, o mês seguinte parte de 28 e a regra fica no dia 28 para
      // sempre — em vez de voltar ao 31.
      //
      // Corrigir exige guardar o dia âncora na regra (coluna nova), o que é
      // mudança de schema e não entrou nesta correção. O teste existe para que
      // a limitação seja conhecida em vez de descoberta.
      const { service, cap } = harness({
        rule: { ...regraFixa, next_occurrence_at: new Date('2026-02-28T12:00:00.000Z') },
        lastTransaction: ultima,
      });

      await service.generateNext('rule-1');

      const update = cap.updates.find((u) => u.model === 'recurringRule')!;
      const data = (update.args as { data: { next_occurrence_at: Date } }).data;
      expect(data.next_occurrence_at.toISOString()).toBe('2026-03-28T12:00:00.000Z');
    });

    it('regra inexistente é no-op', async () => {
      const { service, cap } = harness({ rule: null });

      await expect(service.generateNext('nao-existe')).resolves.toBeNull();
      expect(cap.transactions).toEqual([]);
    });

    it('regra inativa é no-op', async () => {
      const { service, cap } = harness({
        rule: { ...regraFixa, is_active: false },
        lastTransaction: ultima,
      });

      await expect(service.generateNext('rule-1')).resolves.toBeNull();
      expect(cap.transactions).toEqual([]);
    });

    it('regra parcelada é no-op — a série inteira já foi criada de uma vez', async () => {
      const { service, cap } = harness({
        rule: { ...regraFixa, mode: RecurringRuleMode.installment },
        lastTransaction: ultima,
      });

      await expect(service.generateNext('rule-1')).resolves.toBeNull();
      expect(cap.transactions).toEqual([]);
    });

    it('regra sem nenhuma transação anterior é no-op — não há o que copiar', async () => {
      const { service, cap } = harness({ rule: regraFixa, lastTransaction: null });

      await expect(service.generateNext('rule-1')).resolves.toBeNull();
      expect(cap.transactions).toEqual([]);
    });
  });

  describe('scope inválido', () => {
    it.each(['todas', '', 'this_and_past'])('updateTransaction rejeita %p', async (scope) => {
      const { service } = harness({});

      await expect(
        service.updateTransaction('tx-1', {}, scope as RecurringScope, user),
      ).rejects.toThrow('scope deve ser "this" ou "this_and_future"');
    });

    it('deleteTransaction rejeita scope inválido', async () => {
      const { service } = harness({});

      await expect(
        service.deleteTransaction('tx-1', 'qualquer' as RecurringScope, user),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('valida o scope ANTES de ir ao banco', async () => {
      // Se a ordem invertesse, um scope digitado errado viraria 404 de
      // transação — mensagem que manda o dev investigar o lugar errado.
      const { service } = harness({ transaction: null });

      await expect(
        service.updateTransaction('tx-1', {}, 'errado' as RecurringScope, user),
      ).rejects.toThrow('scope deve ser "this" ou "this_and_future"');
    });
  });

  describe('transação bloqueada para edição', () => {
    it('transação inexistente vira 404', async () => {
      const { service } = harness({ transaction: null });

      await expect(service.updateTransaction('tx-1', {}, 'this', user)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('transação já confirmada em exportação contábil não pode ser editada', async () => {
      // `confirmed` é posto pelo export SPED. Editar depois descasaria o
      // arquivo entregue à contabilidade do que está no banco.
      const { service } = harness({ transaction: { id: 'tx-1', status: 'confirmed' } });

      await expect(service.updateTransaction('tx-1', {}, 'this', user)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('nem apagada', async () => {
      const { service } = harness({ transaction: { id: 'tx-1', status: 'confirmed' } });

      await expect(service.deleteTransaction('tx-1', 'this', user)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('updateTransaction — scope `this`', () => {
    it('desliga a transação da regra ao editar só ela', async () => {
      // `recurring_rule_id: null` é o que impede a próxima geração de
      // sobrescrever a edição manual.
      const { service, cap } = harness({});

      await service.updateTransaction('tx-1', { amount: 200 }, 'this', user);

      const args = cap.updates[0]!.args as { data: Record<string, unknown> };
      expect(args.data['recurring_rule_id']).toBeNull();
    });

    it('monta o `data` só com os campos enviados', async () => {
      const { service, cap } = harness({});

      await service.updateTransaction('tx-1', { amount: 200 }, 'this', user);

      const args = cap.updates[0]!.args as { data: Record<string, unknown> };
      expect(Object.keys(args.data).sort()).toEqual(['amount', 'recurring_rule_id']);
    });

    it('campos nulos explícitos são gravados, campos ausentes não', async () => {
      // A diferença entre `!== undefined` e truthy: `notes: ''` e
      // `cost_center_id: null` são intenção de limpar o campo, não ausência.
      const { service, cap } = harness({});

      const dto = {
        notes: '',
        cost_center_id: null,
        donor_person_id: null,
        description: '',
      } as unknown as UpdateTransactionDto;
      await service.updateTransaction('tx-1', dto, 'this', user);

      const data = (cap.updates[0]!.args as { data: Record<string, unknown> }).data;
      expect(data['notes']).toBe('');
      expect(data['cost_center_id']).toBeNull();
      expect(data['donor_person_id']).toBeNull();
      expect(data['description']).toBe('');
    });

    it('`donor_person_id` enviado é gravado — é o doador do dízimo', async () => {
      const { service, cap } = harness({});

      await service.updateTransaction(
        'tx-1',
        { donor_person_id: 'pessoa-9' },
        'this',
        user,
      );

      const data = (cap.updates[0]!.args as { data: Record<string, unknown> }).data;
      expect(data['donor_person_id']).toBe('pessoa-9');
    });

    it('`amount: 0` é gravado — é valor, não ausência', async () => {
      const { service, cap } = harness({});

      await service.updateTransaction('tx-1', { amount: 0 }, 'this', user);

      const data = (cap.updates[0]!.args as { data: Record<string, unknown> }).data;
      expect(String(data['amount'])).toBe('0');
    });

    it('`occurred_at` só entra no scope `this`', async () => {
      const { service, cap } = harness({});
      const quando = new Date('2026-05-05T12:00:00.000Z');

      await service.updateTransaction('tx-1', { occurred_at: quando }, 'this', user);

      const data = (cap.updates[0]!.args as { data: Record<string, unknown> }).data;
      expect(data['occurred_at']).toBe(quando);
    });

    it('grava auditoria com o antes e o depois', async () => {
      const { service, cap } = harness({});

      await service.updateTransaction('tx-1', { amount: 200 }, 'this', user);

      expect(cap.audits[0]).toMatchObject({
        entity: 'financial_transaction',
        action: 'updated',
        actor_user_id: 'user-1',
      });
      expect(cap.audits[0]).toHaveProperty('before');
      expect(cap.audits[0]).toHaveProperty('after');
    });

    it('numa sessão de suporte, o ator auditado é quem impersonou', async () => {
      const { service, cap } = harness({});

      await service.updateTransaction(
        'tx-1',
        { amount: 200 },
        'this',
        { ...user, impersonated_by: 'suporte-9', support_session: true },
      );

      expect(cap.audits[0]?.['actor_user_id']).toBe('suporte-9');
    });

    it('falha da auditoria não desfaz a edição', async () => {
      // O `.catch(() => void 0)` é deliberado: perder o log é ruim, perder a
      // edição do tesoureiro por causa disso é pior. Prende a escolha.
      const { service } = harness({ auditThrows: true });

      await expect(
        service.updateTransaction('tx-1', { amount: 200 }, 'this', user),
      ).resolves.toBeDefined();
    });
  });

  describe('updateTransaction — troca de categoria', () => {
    it('categoria nova inexistente vira 404', async () => {
      const { service } = harness({
        transaction: { id: 'tx-1', status: 'pending', type: 'expense', category_id: 'cat-1' },
        category: null,
      });

      await expect(
        service.updateTransaction('tx-1', { category_id: 'cat-nova' }, 'this', user),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('categoria de tipo diferente vira 400', async () => {
      const { service } = harness({
        transaction: { id: 'tx-1', status: 'pending', type: 'expense', category_id: 'cat-1' },
        category: { id: 'cat-nova', type: 'income' },
      });

      await expect(
        service.updateTransaction('tx-1', { category_id: 'cat-nova' }, 'this', user),
      ).rejects.toThrow(
        'Tipo da transação (expense) não corresponde ao tipo da categoria (income)',
      );
    });

    it('trocar tipo e categoria juntos é aceito quando os dois casam', async () => {
      // O `effectiveType` é o `dto.type` quando enviado — sem isso, mudar de
      // despesa para receita junto com a categoria seria sempre rejeitado.
      const { service, cap } = harness({
        transaction: { id: 'tx-1', status: 'pending', type: 'expense', category_id: 'cat-1' },
        category: { id: 'cat-nova', type: 'income' },
      });

      await service.updateTransaction(
        'tx-1',
        { category_id: 'cat-nova', type: TransactionType.income },
        'this',
        user,
      );

      const data = (cap.updates[0]!.args as { data: Record<string, unknown> }).data;
      expect(data['type']).toBe('income');
      expect(data['category_id']).toBe('cat-nova');
    });

    it('mandar a MESMA categoria não dispara a checagem de tipo', async () => {
      // `dto.category_id !== transaction.category_id` é o guarda. Se ele
      // sumisse, um PATCH que reenvia a categoria atual passaria a consultar o
      // banco à toa — e falharia se a categoria tivesse mudado de tipo.
      const { service, cap } = harness({
        transaction: { id: 'tx-1', status: 'pending', type: 'expense', category_id: 'cat-1' },
        category: { id: 'cat-1', type: 'income' },
      });

      await service.updateTransaction('tx-1', { category_id: 'cat-1' }, 'this', user);

      expect(cap.updates).toHaveLength(1);
    });
  });

  describe('updateTransaction — scope `this_and_future`', () => {
    const daRegra = {
      id: 'tx-1',
      status: 'pending',
      type: 'expense',
      category_id: 'cat-1',
      recurring_rule_id: 'rule-1',
      occurred_at: new Date('2026-03-01T12:00:00.000Z'),
    };

    it('atualiza só as pendentes desta data em diante, e devolve a contagem', async () => {
      const { service, cap } = harness({ transaction: daRegra, updateManyCount: 5 });

      const result = await service.updateTransaction('tx-1', { amount: 200 }, 'this_and_future', user);

      expect(result).toEqual({ updated_count: 5 });
      const args = cap.updates[0]!.args as { where: Record<string, unknown> };
      expect(args.where).toEqual({
        recurring_rule_id: 'rule-1',
        status: 'pending',
        occurred_at: { gte: daRegra.occurred_at },
      });
    });

    it('não mexe em `occurred_at` em massa — deslocaria a série toda', async () => {
      const { service, cap } = harness({ transaction: daRegra });

      await service.updateTransaction(
        'tx-1',
        { amount: 200, occurred_at: new Date('2026-09-09T12:00:00.000Z') },
        'this_and_future',
        user,
      );

      const args = cap.updates[0]!.args as { data: Record<string, unknown> };
      expect(args.data).not.toHaveProperty('occurred_at');
    });

    it('não desliga as transações da regra', async () => {
      const { service, cap } = harness({ transaction: daRegra });

      await service.updateTransaction('tx-1', { amount: 200 }, 'this_and_future', user);

      const args = cap.updates[0]!.args as { data: Record<string, unknown> };
      expect(args.data).not.toHaveProperty('recurring_rule_id');
    });

    it('transação solta (sem regra) vira 400 nesse scope', async () => {
      const { service } = harness({
        transaction: { ...daRegra, recurring_rule_id: null },
      });

      await expect(
        service.updateTransaction('tx-1', { amount: 200 }, 'this_and_future', user),
      ).rejects.toThrow('Transação não pertence a uma regra recorrente');
    });

    it('audita com a ação própria do scope', async () => {
      const { service, cap } = harness({ transaction: daRegra });

      await service.updateTransaction('tx-1', { amount: 200 }, 'this_and_future', user);

      expect(cap.audits[0]?.['action']).toBe('updated_this_and_future');
    });

    it('falha da auditoria não desfaz o update em massa', async () => {
      const { service } = harness({ transaction: daRegra, auditThrows: true });

      await expect(
        service.updateTransaction('tx-1', { amount: 200 }, 'this_and_future', user),
      ).resolves.toEqual({ updated_count: 3 });
    });
  });

  describe('deleteTransaction — scope `this`', () => {
    it('apaga uma e audita o antes', async () => {
      const { service, cap } = harness({});

      await service.deleteTransaction('tx-1', 'this', user);

      expect(cap.deletes).toEqual([{ model: 'delete', args: { where: { id: 'tx-1' } } }]);
      expect(cap.audits[0]).toMatchObject({ action: 'deleted' });
      expect(cap.audits[0]).toHaveProperty('before');
      expect(cap.audits[0]).not.toHaveProperty('after');
    });

    it('não desativa a regra ao apagar uma parcela só', async () => {
      const { service, cap } = harness({});

      await service.deleteTransaction('tx-1', 'this', user);

      expect(cap.updates).toEqual([]);
    });

    it('falha da auditoria não desfaz a exclusão', async () => {
      const { service } = harness({ auditThrows: true });

      await expect(service.deleteTransaction('tx-1', 'this', user)).resolves.toBeDefined();
    });
  });

  describe('deleteTransaction — scope `this_and_future`', () => {
    const daRegra = {
      id: 'tx-1',
      status: 'pending',
      recurring_rule_id: 'rule-1',
      occurred_at: new Date('2026-03-01T12:00:00.000Z'),
    };

    it('apaga as pendentes daqui pra frente e desativa a regra', async () => {
      // Desativar é o que impede o scheduler de recriar o que acabou de ser
      // apagado. Sem isso, `generateNext` traria a série de volta.
      const { service, cap } = harness({ transaction: daRegra, deleteManyCount: 7 });

      const result = await service.deleteTransaction('tx-1', 'this_and_future', user);

      expect(result).toEqual({ deleted_count: 7 });
      expect(cap.deletes[0]).toEqual({
        model: 'deleteMany',
        args: {
          where: {
            recurring_rule_id: 'rule-1',
            status: 'pending',
            occurred_at: { gte: daRegra.occurred_at },
          },
        },
      });
      expect(cap.updates).toEqual([
        { model: 'recurringRule', args: { where: { id: 'rule-1' }, data: { is_active: false } } },
      ]);
    });

    it('preserva as já pagas — o filtro é `status: pending`', async () => {
      const { service, cap } = harness({ transaction: daRegra });

      await service.deleteTransaction('tx-1', 'this_and_future', user);

      const where = (cap.deletes[0]!.args as { where: Record<string, unknown> }).where;
      expect(where['status']).toBe('pending');
    });

    it('transação solta (sem regra) vira 400 nesse scope', async () => {
      const { service } = harness({
        transaction: { ...daRegra, recurring_rule_id: null },
      });

      await expect(
        service.deleteTransaction('tx-1', 'this_and_future', user),
      ).rejects.toThrow('Transação não pertence a uma regra recorrente');
    });

    it('audita com a ação própria do scope', async () => {
      const { service, cap } = harness({ transaction: daRegra });

      await service.deleteTransaction('tx-1', 'this_and_future', user);

      expect(cap.audits[0]?.['action']).toBe('deleted_this_and_future');
    });

    it('falha da auditoria não desfaz a exclusão em massa', async () => {
      const { service } = harness({ transaction: daRegra, auditThrows: true });

      await expect(
        service.deleteTransaction('tx-1', 'this_and_future', user),
      ).resolves.toEqual({ deleted_count: 2 });
    });
  });
});
