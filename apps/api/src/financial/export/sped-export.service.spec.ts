/**
 * SPED ECD é layout posicional, e a Receita rejeita o arquivo inteiro por um
 * campo fora de lugar. Não há erro em runtime para pegar: o job termina
 * `done`, o contador baixa o .txt e descobre semanas depois.
 *
 * Por isso a suíte tem duas camadas:
 *
 *   1. **Golden file** (`sped-export.golden.txt`) — comparação byte a byte do
 *      arquivo inteiro. Qualquer mudança de layout aparece como diff de texto
 *      na revisão, que é o único jeito de um humano conferir posição de campo.
 *   2. **Asserts das regras** — os contadores de bloco (`0990`, `I990`,
 *      `9990`, `9999`) e o `9900` são calculados a partir do próprio arquivo;
 *      um golden file sozinho passaria a validar aritmética errada no dia em
 *      que alguém regenerasse o golden junto com o bug.
 *
 * Se um teste de golden falhar: NÃO regenere o arquivo por reflexo. Leia o
 * diff primeiro — ele é o achado.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Decimal } from '@prisma/client/runtime/library';
import { SpedExportService } from './sped-export.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { JobsService } from './jobs.service';
import { ExportRequestDto } from './dto/export-request.dto';

const GOLDEN = path.join(__dirname, 'sped-export.golden.txt');

type Row = {
  id: string;
  amount: Decimal;
  occurred_at: Date;
  description: string | null;
  category: { name: string; type: string };
  costCenter: { name: string } | null;
  pixPayment: { asaas_payment_id: string | null } | null;
};

type RowSpec = Omit<Partial<Row>, 'amount' | 'category'> & {
  amount: string;
  type: string;
  category: string;
};

function row(over: RowSpec): Row {
  return {
    id: over.id ?? 'tx-0000',
    amount: new Decimal(over.amount),
    occurred_at: over.occurred_at ?? new Date('2026-01-15T12:00:00.000Z'),
    description: over.description ?? null,
    category: { name: over.category, type: over.type },
    costCenter: over.costCenter ?? null,
    pixPayment: over.pixPayment ?? null,
  };
}

const periodo: ExportRequestDto = { period_start: '2026-01-01', period_end: '2026-01-31' };

function harness(rows: Row[], tenantName: string | null = 'Igreja Central') {
  const uploads: { buffer: Buffer; key: string; contentType: string }[] = [];
  const jobCalls: string[] = [];
  const confirmed: string[][] = [];
  let jobError: string | undefined;
  let finished!: () => void;
  const done = new Promise<void>((resolve) => (finished = resolve));

  const jobs = {
    create: (
      _t: string,
      _c: string,
      _type: unknown,
      _s: Date,
      _e: Date,
      _by: string,
    ) => {
      jobCalls.push('create');
      return Promise.resolve({ id: 'job-1' });
    },
    markProcessing: () => {
      jobCalls.push('markProcessing');
      return Promise.resolve();
    },
    markDone: (_id: string, url: string) => {
      jobCalls.push(`markDone:${url}`);
      finished();
      return Promise.resolve();
    },
    markError: (_id: string, msg: string) => {
      jobCalls.push('markError');
      jobError = msg;
      finished();
      return Promise.resolve();
    },
  } as unknown as JobsService;

  const storage = {
    upload: (buffer: Buffer, key: string, contentType: string) => {
      uploads.push({ buffer, key, contentType });
      return Promise.resolve();
    },
    getPresignedGetUrl: (key: string) => Promise.resolve(`https://cdn.test/${key}`),
  } as unknown as StorageService;

  const wheres: Record<string, unknown>[] = [];
  const prisma = {
    system: {
      financialTransaction: {
        findMany: (args: { where: Record<string, unknown> }) => {
          wheres.push(args.where);
          return Promise.resolve(rows);
        },
        updateMany: (args: { where: { id: { in: string[] } } }) => {
          confirmed.push(args.where.id.in);
          return Promise.resolve({ count: args.where.id.in.length });
        },
      },
      tenant: {
        findUnique: () =>
          Promise.resolve(tenantName === null ? null : { name: tenantName }),
      },
    },
  } as unknown as PrismaService;

  const service = new SpedExportService(prisma, storage, jobs);

  return {
    service,
    uploads,
    jobCalls,
    confirmed,
    wheres,
    done,
    error: () => jobError,
  };
}

/** Roda o export inteiro e devolve o texto do arquivo gerado. */
async function generate(rows: Row[], tenantName: string | null = 'Igreja Central') {
  const h = harness(rows, tenantName);
  const result = await h.service.exportSped('t1', 'c1', periodo, 'user-1');
  await h.done;
  return { h, result, text: h.uploads[0]?.buffer.toString('utf-8') ?? '' };
}

/** As transações do golden file. Mudar esta lista muda o golden. */
const rowsDoGolden: Row[] = [
  row({
    id: 'tx-0001',
    amount: '1500.00',
    type: 'income',
    category: 'Dízimos',
    occurred_at: new Date('2026-01-05T10:00:00.000Z'),
    description: 'Culto de domingo',
    pixPayment: { asaas_payment_id: 'pay_abc123' },
  }),
  row({
    id: 'tx-0002',
    amount: '250.75',
    type: 'income',
    category: 'Ofertas',
    occurred_at: new Date('2026-01-12T10:00:00.000Z'),
  }),
  row({
    id: 'tx-0003',
    amount: '800.00',
    type: 'expense',
    category: 'Aluguel',
    occurred_at: new Date('2026-01-20T10:00:00.000Z'),
    description: 'Aluguel | janeiro',
  }),
  row({
    id: 'tx-0004',
    amount: '99.90',
    type: 'expense',
    category: 'Aluguel',
    occurred_at: new Date('2026-01-25T10:00:00.000Z'),
    description: 'Taxa condominial',
  }),
];

describe('SpedExportService', () => {
  describe('arquivo gerado', () => {
    it('bate byte a byte com o golden file', async () => {
      const { text } = await generate(rowsDoGolden);

      expect(text).toBe(fs.readFileSync(GOLDEN, 'utf-8'));
    });

    it('termina cada linha com CRLF, inclusive a última', async () => {
      // SPED exige CRLF. Um `\n` solo é o tipo de coisa que passa em editor e
      // quebra no validador.
      const { text } = await generate(rowsDoGolden);

      expect(text.endsWith('\r\n')).toBe(true);
      expect(text.split('\r\n').filter((l) => l !== '')).toHaveLength(
        text.split('\r\n').length - 1,
      );
      expect(text).not.toMatch(/[^\r]\n/);
    });
  });

  describe('contadores de bloco', () => {
    // Os quatro contadores são calculados por aritmética de índice de array
    // (`lines.length - início + 1`). É onde um off-by-one entra sem aviso.
    async function linhas(rows: Row[]) {
      const { text } = await generate(rows);
      return text.split('\r\n').filter((l) => l !== '');
    }

    function campo(linha: string, i: number) {
      return linha.split('|')[i];
    }

    it('|0990| conta o bloco 0 INTEIRO, com o |0000| e com ele mesmo', async () => {
      // Saía 4 em vez de 5: o contador começava depois do push do `|0000|`.
      // `QTD_LIN_0` é a quantidade total de linhas do bloco 0, e o `0000` é
      // registro do bloco 0 — o próprio `|9900|0000|1|` já o contava.
      const ls = await linhas(rowsDoGolden);
      const bloco0 = ls.filter((l) => /^\|0/.test(l));

      const declarado = Number(campo(ls.find((l) => l.startsWith('|0990|'))!, 2));
      expect(declarado).toBe(bloco0.length);
      expect(declarado).toBe(5);
    });

    it('|I990| conta os registros do bloco I, incluindo ele mesmo', async () => {
      const ls = await linhas(rowsDoGolden);
      const blocoI = ls.filter((l) => /^\|I/.test(l));

      const declarado = Number(campo(ls.find((l) => l.startsWith('|I990|'))!, 2));
      expect(declarado).toBe(blocoI.length);
    });

    it('|9990| conta os registros do bloco 9, incluindo ele mesmo', async () => {
      const ls = await linhas(rowsDoGolden);
      const bloco9 = ls.filter((l) => /^\|9(001|900|990)\|/.test(l));

      const declarado = Number(campo(ls.find((l) => l.startsWith('|9990|'))!, 2));
      expect(declarado).toBe(bloco9.length);
    });

    it('|9999| declara o total de linhas do arquivo', async () => {
      const ls = await linhas(rowsDoGolden);

      const declarado = Number(campo(ls[ls.length - 1]!, 2));
      expect(ls[ls.length - 1]).toMatch(/^\|9999\|/);
      expect(declarado).toBe(ls.length);
    });

    it('cada |9900| declara a contagem real daquele tipo de registro', async () => {
      const ls = await linhas(rowsDoGolden);

      const real = new Map<string, number>();
      for (const l of ls) {
        const reg = campo(l, 1)!;
        real.set(reg, (real.get(reg) ?? 0) + 1);
      }

      for (const l of ls.filter((x) => x.startsWith('|9900|'))) {
        const reg = campo(l, 2)!;
        const declarado = Number(campo(l, 3));
        expect({ reg, declarado }).toEqual({ reg, declarado: real.get(reg) });
      }
    });
  });

  describe('partidas dobradas', () => {
    it('receita debita Caixa e credita a conta da categoria', async () => {
      const { text } = await generate([
        row({ id: 'tx-r', amount: '10.00', type: 'income', category: 'Dízimos' }),
      ]);
      const i155 = text.split('\r\n').filter((l) => l.startsWith('|I155|'));

      expect(i155[0]).toContain('|3.1.001||10,00|D|');
      expect(i155[1]).toContain('|1.1.001||10,00|C|');
    });

    it('despesa debita a categoria e credita Caixa', async () => {
      const { text } = await generate([
        row({ id: 'tx-d', amount: '10.00', type: 'expense', category: 'Aluguel' }),
      ]);
      const i155 = text.split('\r\n').filter((l) => l.startsWith('|I155|'));

      expect(i155[0]).toContain('|2.1.001||10,00|D|');
      expect(i155[1]).toContain('|3.1.001||10,00|C|');
    });

    it('cada lançamento gera um I150 e exatamente dois I155', async () => {
      const { text } = await generate(rowsDoGolden);
      const ls = text.split('\r\n');

      expect(ls.filter((l) => l.startsWith('|I150|'))).toHaveLength(4);
      expect(ls.filter((l) => l.startsWith('|I155|'))).toHaveLength(8);
    });

    it('o sequencial do lançamento tem 6 dígitos', async () => {
      const { text } = await generate(rowsDoGolden);
      const i150 = text.split('\r\n').filter((l) => l.startsWith('|I150|'));

      expect(i150.map((l) => l.split('|')[2])).toEqual([
        '000001',
        '000002',
        '000003',
        '000004',
      ]);
    });
  });

  describe('plano de contas', () => {
    it('numera receitas em 1.1.NNN e despesas em 2.1.NNN, sem repetir categoria', async () => {
      const { text } = await generate(rowsDoGolden);
      const i050 = text.split('\r\n').filter((l) => l.startsWith('|I050|'));

      // Caixa + Dízimos + Ofertas + Aluguel. `Aluguel` aparece em duas
      // transações e vira uma conta só.
      expect(i050.map((l) => `${l.split('|')[3]} ${l.split('|')[7]}`)).toEqual([
        '3.1.001 Caixa',
        '1.1.001 Dízimos',
        '1.1.002 Ofertas',
        '2.1.001 Aluguel',
      ]);
    });

    it('sem transação nenhuma, o plano tem só o Caixa', async () => {
      const { text } = await generate([]);
      const i050 = text.split('\r\n').filter((l) => l.startsWith('|I050|'));

      expect(i050).toHaveLength(1);
      expect(i050[0]).toContain('|3.1.001|');
    });

    it('o sequencial da conta é zero-padded em 3 dígitos', async () => {
      const rows = Array.from({ length: 10 }, (_, i) =>
        row({ id: `tx-${i}`, amount: '1.00', type: 'income', category: `Cat ${i}` }),
      );
      const { text } = await generate(rows);
      const codigos = text
        .split('\r\n')
        .filter((l) => l.startsWith('|I050|'))
        .map((l) => l.split('|')[3]);

      expect(codigos).toContain('1.1.001');
      expect(codigos).toContain('1.1.010');
    });
  });

  describe('formatação de campo', () => {
    it('valor usa vírgula decimal e sempre duas casas', async () => {
      const { text } = await generate([
        row({ id: 'tx-1', amount: '1234.5', type: 'income', category: 'Dízimos' }),
      ]);

      expect(text).toContain('|1234,50|');
    });

    it('valor negativo entra pelo módulo — o sinal é o D/C, não o número', async () => {
      const { text } = await generate([
        row({ id: 'tx-1', amount: '-50.00', type: 'expense', category: 'Estorno' }),
      ]);

      expect(text).toContain('|50,00|');
      expect(text).not.toContain('-50,00');
    });

    it('data vira DDMMAAAA em UTC', async () => {
      const { text } = await generate([
        row({
          id: 'tx-1',
          amount: '1.00',
          type: 'income',
          category: 'Dízimos',
          occurred_at: new Date('2026-03-07T23:30:00.000Z'),
        }),
      ]);

      expect(text).toContain('|07032026|');
      // O período do arquivo também: 01/01/2026 a 31/01/2026.
      expect(text).toContain('|01012026|31012026|');
    });

    it('pipe no texto é trocado por espaço — senão quebra o layout', async () => {
      // `Aluguel | janeiro` no histórico de uma transação do golden.
      const { text } = await generate(rowsDoGolden);
      const i155 = text.split('\r\n').filter((l) => l.startsWith('|I155|'));

      expect(i155.some((l) => l.includes('Aluguel   janeiro'))).toBe(true);
      // O layout continua com o número de campos esperado.
      for (const l of i155) expect(l.split("|")).toHaveLength(11);
    });

    it('trunca o nome da conta em 60 caracteres', async () => {
      const nomeLongo = 'C'.repeat(80);
      const { text } = await generate([
        row({ id: 'tx-1', amount: '1.00', type: 'income', category: nomeLongo }),
      ]);
      const i050 = text.split('\r\n').filter((l) => l.startsWith('|I050|'));

      expect(i050[1]?.split('|')[7]).toBe('C'.repeat(60));
    });

    it('trunca histórico e documento em 60 caracteres', async () => {
      const { text } = await generate([
        row({
          id: 'tx-1',
          amount: '1.00',
          type: 'income',
          category: 'Dízimos',
          description: 'D'.repeat(80),
          pixPayment: { asaas_payment_id: 'P'.repeat(80) },
        }),
      ]);
      const campos = text
        .split('\r\n')
        .filter((l) => l.startsWith('|I155|'))[0]!
        .split('|');

      expect(campos[7]).toBe('P'.repeat(60));
      expect(campos[8]).toBe('D'.repeat(60));
    });

    it('trunca o nome do tenant em 100 caracteres', async () => {
      const { text } = await generate([], 'T'.repeat(150));

      expect(text.split('\r\n')[0]?.split('|')[6]).toBe('T'.repeat(100));
    });

    it('sem tenant no banco, o nome cai para EMPRESA', async () => {
      const { text } = await generate([], null);

      expect(text.split('\r\n')[0]).toContain('|EMPRESA|');
    });

    it('sem descrição, o histórico é o nome da categoria', async () => {
      const { text } = await generate([
        row({ id: 'tx-1', amount: '1.00', type: 'income', category: 'Ofertas' }),
      ]);
      const campos = text
        .split('\r\n')
        .filter((l) => l.startsWith('|I155|'))[0]!
        .split('|');

      expect(campos[8]).toBe('Ofertas');
    });

    it('sem pagamento Pix, o documento é o id da transação', async () => {
      const { text } = await generate([
        row({ id: 'tx-sem-pix', amount: '1.00', type: 'income', category: 'Ofertas' }),
      ]);
      const campos = text
        .split('\r\n')
        .filter((l) => l.startsWith('|I155|'))[0]!
        .split('|');

      expect(campos[7]).toBe('tx-sem-pix');
    });

    it('Pix sem `asaas_payment_id` também cai para o id da transação', async () => {
      const { text } = await generate([
        row({
          id: 'tx-pix-nulo',
          amount: '1.00',
          type: 'income',
          category: 'Ofertas',
          pixPayment: { asaas_payment_id: null },
        }),
      ]);
      const campos = text
        .split('\r\n')
        .filter((l) => l.startsWith('|I155|'))[0]!
        .split('|');

      expect(campos[7]).toBe('tx-pix-nulo');
    });
  });

  describe('ciclo do job', () => {
    it('responde na hora com o job pendente e processa depois', async () => {
      const h = harness(rowsDoGolden);

      const result = await h.service.exportSped('t1', 'c1', periodo, 'user-1');

      // A resposta HTTP não espera o arquivo: `setImmediate` põe o
      // processamento na fila. Neste ponto só `create` rodou.
      expect(result).toEqual({ type: 'job', job_id: 'job-1', status: 'pending' });
      expect(h.jobCalls).toEqual(['create']);

      await h.done;
      expect(h.jobCalls).toEqual([
        'create',
        'markProcessing',
        'markDone:https://cdn.test/exports/t1/job-1.txt',
      ]);
    });

    it('sobe o arquivo como text/plain utf-8 na chave do tenant', async () => {
      const { h } = await generate(rowsDoGolden);

      expect(h.uploads[0]?.key).toBe('exports/t1/job-1.txt');
      expect(h.uploads[0]?.contentType).toBe('text/plain; charset=utf-8');
    });

    it('marca as transações exportadas como confirmed', async () => {
      const { h } = await generate(rowsDoGolden);

      expect(h.confirmed).toEqual([['tx-0001', 'tx-0002', 'tx-0003', 'tx-0004']]);
    });

    it('sem transação, não chama updateMany — evita um UPDATE sem where útil', async () => {
      const { h } = await generate([]);

      expect(h.confirmed).toEqual([]);
    });

    it('falha do storage marca o job com erro e não confirma nada', async () => {
      const h = harness(rowsDoGolden);
      (h.service as unknown as { storage: StorageService }).storage = {
        upload: () => Promise.reject(new Error('R2 fora do ar')),
        getPresignedGetUrl: () => Promise.resolve(''),
      } as unknown as StorageService;

      await h.service.exportSped('t1', 'c1', periodo, 'user-1');
      await h.done;

      expect(h.error()).toBe('R2 fora do ar');
      expect(h.confirmed).toEqual([]);
      expect(h.jobCalls).toContain('markError');
    });

    it('rejeição sem Error vira string na mensagem do job', async () => {
      const h = harness(rowsDoGolden);
      (h.service as unknown as { storage: StorageService }).storage = {
        upload: () => Promise.reject('caiu'),
        getPresignedGetUrl: () => Promise.resolve(''),
      } as unknown as StorageService;

      await h.service.exportSped('t1', 'c1', periodo, 'user-1');
      await h.done;

      expect(h.error()).toBe('caiu');
    });
  });

  describe('consulta ao banco', () => {
    it('exporta só transação paga, do tenant e da congregação do token', async () => {
      const { h } = await generate(rowsDoGolden);

      expect(h.wheres[0]).toEqual({
        tenant_id: 't1',
        congregation_id: 'c1',
        occurred_at: {
          gte: new Date('2026-01-01T00:00:00.000Z'),
          lte: new Date('2026-01-31T23:59:59.999Z'),
        },
        status: 'paid',
      });
    });

    it('`congregation_id` do dto tem precedência sobre a do token', async () => {
      const h = harness([]);
      await h.service.exportSped(
        't1',
        'c-token',
        { ...periodo, congregation_id: 'c-dto' },
        'user-1',
      );
      await h.done;

      expect(h.wheres[0]?.['congregation_id']).toBe('c-dto');
    });

    it('`cost_center` vira filtro por nome', async () => {
      const h = harness([]);
      await h.service.exportSped(
        't1',
        'c1',
        { ...periodo, cost_center: 'Missões' },
        'user-1',
      );
      await h.done;

      expect(h.wheres[0]?.['costCenter']).toEqual({ name: 'Missões' });
    });

    it('sem `cost_center`, a chave não vai para o where', async () => {
      const { h } = await generate([]);

      expect(h.wheres[0]).not.toHaveProperty('costCenter');
    });
  });
});
