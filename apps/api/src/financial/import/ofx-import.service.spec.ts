import { BadRequestException } from '@nestjs/common';
import { OfxImportService } from './ofx-import.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['treasurer'],
  plan: 'premium',
};

function fileOf(content: string, name = 'extrato.ofx'): Express.Multer.File {
  return {
    originalname: name,
    buffer: Buffer.from(content, 'latin1'),
    size: Buffer.byteLength(content, 'latin1'),
    mimetype: 'application/x-ofx',
  } as Express.Multer.File;
}

/** Monta um OFX 1.x (SGML) mínimo com as transações dadas — tags sem
 * fechamento, como a maioria dos bancos exporta de verdade. */
function ofxOf(
  trns: { fitid: string; dtposted: string; trnamt: string; name?: string }[],
): string {
  const stmtTrns = trns
    .map(
      (t) =>
        `<STMTTRN>\n<TRNTYPE>${t.trnamt.startsWith('-') ? 'DEBIT' : 'CREDIT'}\n<DTPOSTED>${t.dtposted}\n<TRNAMT>${t.trnamt}\n<FITID>${t.fitid}\n<NAME>${t.name ?? 'Lançamento'}\n</STMTTRN>`,
    )
    .join('\n');

  return [
    'OFXHEADER:100',
    'DATA:OFXSGML',
    'VERSION:102',
    'SECURITY:NONE',
    'ENCODING:USASCII',
    'CHARSET:1252',
    'COMPRESSION:NONE',
    'OLDFILEUID:NONE',
    'NEWFILEUID:NONE',
    '',
    '<OFX>',
    '<BANKMSGSRSV1>',
    '<STMTTRNRS>',
    '<TRNUID>1',
    '<STATUS><CODE>0<SEVERITY>INFO</STATUS>',
    '<STMTRS>',
    '<CURDEF>BRL',
    '<BANKACCTFROM><ACCTID>12345<ACCTTYPE>CHECKING</BANKACCTFROM>',
    '<BANKTRANLIST>',
    '<DTSTART>20260101',
    '<DTEND>20260131',
    stmtTrns,
    '</BANKTRANLIST>',
    '</STMTRS>',
    '</STMTTRNRS>',
    '</BANKMSGSRSV1>',
    '</OFX>',
  ].join('\r\n');
}

/** Envelope OFX com duas contas (dois blocos `STMTTRNRS`) — o parser devolve
 * `STMTTRNRS` como array nesse caso, o que exercita a recursão de array em
 * `extractStmtTrns` (o caminho que `STMTTRN` sozinho não alcança). */
function ofxComDuasContas(): string {
  const conta = (fitid: string, trnamt: string) =>
    [
      '<STMTTRNRS>',
      '<TRNUID>1',
      '<STATUS><CODE>0<SEVERITY>INFO</STATUS>',
      '<STMTRS>',
      '<CURDEF>BRL',
      '<BANKACCTFROM><ACCTID>12345<ACCTTYPE>CHECKING</BANKACCTFROM>',
      '<BANKTRANLIST>',
      '<DTSTART>20260101',
      '<DTEND>20260131',
      `<STMTTRN>\n<TRNTYPE>CREDIT\n<DTPOSTED>20260112\n<TRNAMT>${trnamt}\n<FITID>${fitid}\n<NAME>Lançamento`,
      '</STMTTRN>',
      '</BANKTRANLIST>',
      '</STMTRS>',
      '</STMTTRNRS>',
    ].join('\r\n');

  return [
    'OFXHEADER:100',
    'DATA:OFXSGML',
    'VERSION:102',
    'SECURITY:NONE',
    'ENCODING:USASCII',
    'CHARSET:1252',
    'COMPRESSION:NONE',
    'OLDFILEUID:NONE',
    'NEWFILEUID:NONE',
    '',
    '<OFX>',
    '<BANKMSGSRSV1>',
    conta('FIT-CONTA-1', '10.00'),
    conta('FIT-CONTA-2', '20.00'),
    '</BANKMSGSRSV1>',
    '</OFX>',
  ].join('\r\n');
}

function serviceWith() {
  const bankStatementTransactionClient = {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
  };
  const importJobClient = {
    create: jest.fn().mockResolvedValue({ id: 'job-1' }),
    update: jest.fn().mockResolvedValue({}),
  };
  const financialTransactionClient = {
    findMany: jest.fn().mockResolvedValue([]),
  };

  const client = {
    bankStatementTransaction: bankStatementTransactionClient,
    importJob: importJobClient,
    financialTransaction: financialTransactionClient,
  };

  // Auditoria vai por audit_insert() no client base — ver write-audit-log.ts.
  const auditRaw = jest.fn().mockResolvedValue(1);
  const prisma = { client, $executeRaw: auditRaw } as unknown as PrismaService;

  return {
    service: new OfxImportService(prisma),
    bankStatementTransactionClient,
    importJobClient,
    financialTransactionClient,
    auditRaw,
  };
}

describe('OfxImportService', () => {
  describe('importOfx', () => {
    it('rejeita extensão inválida', async () => {
      const { service } = serviceWith();
      await expect(service.importOfx(fileOf('x', 'extrato.pdf'), user)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejeita arquivo maior que 10 MB', async () => {
      const { service } = serviceWith();
      const file = fileOf('x');
      Object.assign(file, { size: 11 * 1024 * 1024 });
      await expect(service.importOfx(file, user)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita OFX sem nenhuma transação', async () => {
      const { service } = serviceWith();
      const emptyOfx = ofxOf([]);
      await expect(service.importOfx(fileOf(emptyOfx), user)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('casa transação por valor e data dentro da tolerância', async () => {
      const { service, financialTransactionClient, bankStatementTransactionClient, importJobClient } =
        serviceWith();
      financialTransactionClient.findMany.mockResolvedValue([
        { id: 'tx-1', occurred_at: new Date('2026-01-10T00:00:00Z') },
      ]);

      const file = fileOf(
        ofxOf([{ fitid: 'FIT-1', dtposted: '20260112', trnamt: '150.00', name: 'Dizimo' }]),
      );
      const report = await service.importOfx(file, user);

      expect(report).toEqual({
        job_id: 'job-1',
        total: 1,
        matched: 1,
        unmatched: 0,
        duplicates: 0,
        errors: [],
      });
      expect(bankStatementTransactionClient.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fitid: 'FIT-1',
          is_credit: true,
          financial_transaction_id: 'tx-1',
        }),
      });
      expect(importJobClient.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: expect.objectContaining({ imported: 1, skipped: 0 }),
      });
    });

    it('não casa quando não há FinancialTransaction candidata', async () => {
      const { service, bankStatementTransactionClient } = serviceWith();

      const file = fileOf(
        ofxOf([{ fitid: 'FIT-2', dtposted: '20260112', trnamt: '-80.00', name: 'Fornecedor' }]),
      );
      const report = await service.importOfx(file, user);

      expect(report.matched).toBe(0);
      expect(report.unmatched).toBe(1);
      expect(bankStatementTransactionClient.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ is_credit: false, financial_transaction_id: null }),
      });
    });

    it('reimportar o mesmo extrato não duplica — FITID já visto é pulado', async () => {
      const { service, bankStatementTransactionClient } = serviceWith();
      bankStatementTransactionClient.findMany.mockImplementation(
        async ({ where }: { where: { financial_transaction_id?: unknown } }) => {
          if (where.financial_transaction_id !== undefined) return [];
          return [{ fitid: 'FIT-3' }];
        },
      );

      const file = fileOf(
        ofxOf([{ fitid: 'FIT-3', dtposted: '20260112', trnamt: '10.00', name: 'Repetido' }]),
      );
      const report = await service.importOfx(file, user);

      expect(report).toEqual({ job_id: 'job-1', total: 1, matched: 0, unmatched: 0, duplicates: 1, errors: [] });
      expect(bankStatementTransactionClient.create).not.toHaveBeenCalled();
    });

    it('linha sem FITID vira erro e não conta em total', async () => {
      const { service } = serviceWith();
      const ofxSemFitid = ofxOf([{ fitid: '', dtposted: '20260112', trnamt: '10.00' }]).replace(
        '<FITID>\n',
        '',
      );

      const report = await service.importOfx(fileOf(ofxSemFitid), user);

      expect(report.total).toBe(0);
      expect(report.errors).toEqual([{ row: 1, reason: 'missing_fitid' }]);
    });

    it('não propaga falha de auditoria', async () => {
      const { service, auditRaw } = serviceWith();
      auditRaw.mockRejectedValue(new Error('falha de auditoria'));

      const file = fileOf(
        ofxOf([{ fitid: 'FIT-4', dtposted: '20260112', trnamt: '10.00', name: 'Teste' }]),
      );
      await expect(service.importOfx(file, user)).resolves.toBeDefined();
    });

    it('rejeita mais de 5000 transações em uma importação', async () => {
      const { service } = serviceWith();
      const trns = Array.from({ length: 5001 }, (_, i) => ({
        fitid: `FIT-${i}`,
        dtposted: '20260112',
        trnamt: '1.00',
      }));
      const file = fileOf(ofxOf(trns));

      await expect(service.importOfx(file, user)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('exclui do casamento transações já usadas em importações anteriores', async () => {
      const { service, bankStatementTransactionClient, financialTransactionClient } = serviceWith();
      bankStatementTransactionClient.findMany.mockImplementation(
        async ({ where }: { where: { financial_transaction_id?: unknown } }) => {
          if (where.financial_transaction_id !== undefined) return [{ financial_transaction_id: 'tx-old' }];
          return [];
        },
      );
      financialTransactionClient.findMany.mockResolvedValue([
        { id: 'tx-2', occurred_at: new Date('2026-01-12T00:00:00Z') },
      ]);

      const file = fileOf(
        ofxOf([{ fitid: 'FIT-5', dtposted: '20260112', trnamt: '10.00', name: 'Novo' }]),
      );
      await service.importOfx(file, user);

      expect(financialTransactionClient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { notIn: ['tx-old'] } }),
        }),
      );
    });

    it('escolhe a candidata com data mais próxima quando há mais de uma dentro da tolerância', async () => {
      const { service, financialTransactionClient, bankStatementTransactionClient } = serviceWith();
      financialTransactionClient.findMany.mockResolvedValue([
        { id: 'longe-antes', occurred_at: new Date('2026-01-09T00:00:00Z') }, // diff 3 dias
        { id: 'longe-depois', occurred_at: new Date('2026-01-16T00:00:00Z') }, // diff 4 dias (pior — não reatribui)
        { id: 'mais-perto', occurred_at: new Date('2026-01-11T00:00:00Z') }, // diff 1 dia (melhor — reatribui)
      ]);

      const file = fileOf(
        ofxOf([{ fitid: 'FIT-6', dtposted: '20260112', trnamt: '10.00', name: 'Dizimo' }]),
      );
      await service.importOfx(file, user);

      expect(bankStatementTransactionClient.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ financial_transaction_id: 'mais-perto' }),
      });
    });

    it('rejeita arquivo OFX corrompido (tags desencontradas)', async () => {
      const { service } = serviceWith();
      const corrompido = '<OFX><A><B></A></B></OFX>';

      await expect(service.importOfx(fileOf(corrompido), user)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('linha sem DTPOSTED vira erro e não conta em total', async () => {
      const { service } = serviceWith();
      const ofxSemDtposted = ofxOf([{ fitid: 'FIT-7', dtposted: '20260112', trnamt: '10.00' }]).replace(
        '<DTPOSTED>20260112\n',
        '',
      );

      const report = await service.importOfx(fileOf(ofxSemDtposted), user);

      expect(report.total).toBe(0);
      expect(report.errors).toEqual([{ row: 1, reason: 'missing_dtposted' }]);
    });

    it('linha sem TRNAMT vira erro invalid_trnamt', async () => {
      const { service } = serviceWith();
      const ofxSemTrnamt = ofxOf([{ fitid: 'FIT-8', dtposted: '20260112', trnamt: '10.00' }]).replace(
        '<TRNAMT>10.00\n',
        '',
      );

      const report = await service.importOfx(fileOf(ofxSemTrnamt), user);

      expect(report.total).toBe(0);
      expect(report.errors).toEqual([{ row: 1, reason: 'invalid_trnamt' }]);
    });

    it('DTPOSTED curto demais (menos de 8 dígitos) vira erro invalid_dtposted', async () => {
      const { service } = serviceWith();
      const file = fileOf(ofxOf([{ fitid: 'FIT-9', dtposted: '2026', trnamt: '10.00' }]));

      const report = await service.importOfx(file, user);

      expect(report.errors).toEqual([{ row: 1, reason: 'invalid_dtposted' }]);
    });

    it('DTPOSTED com data inválida (mês 13) vira erro invalid_dtposted', async () => {
      const { service } = serviceWith();
      const file = fileOf(ofxOf([{ fitid: 'FIT-10', dtposted: '20261301', trnamt: '10.00' }]));

      const report = await service.importOfx(file, user);

      expect(report.errors).toEqual([{ row: 1, reason: 'invalid_dtposted' }]);
    });

    it('usa MEMO como descrição quando NAME está ausente', async () => {
      const { service, bankStatementTransactionClient } = serviceWith();
      const semName = ofxOf([{ fitid: 'FIT-11', dtposted: '20260112', trnamt: '10.00' }]).replace(
        /<NAME>[^\n]*\n/,
        '<MEMO>Texto do memo\n',
      );

      await service.importOfx(fileOf(semName), user);

      expect(bankStatementTransactionClient.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ description: 'Texto do memo' }),
      });
    });

    it('descrição fica nula quando faltam NAME e MEMO', async () => {
      const { service, bankStatementTransactionClient } = serviceWith();
      const semDescricao = ofxOf([{ fitid: 'FIT-12', dtposted: '20260112', trnamt: '10.00' }]).replace(
        /<NAME>[^\n]*\n/,
        '',
      );

      await service.importOfx(fileOf(semDescricao), user);

      expect(bankStatementTransactionClient.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ description: null }),
      });
    });

    it('extrato com mais de uma transação no mesmo BANKTRANLIST (STMTTRN vira array no parser)', async () => {
      const { service } = serviceWith();
      const file = fileOf(
        ofxOf([
          { fitid: 'FIT-13', dtposted: '20260112', trnamt: '10.00', name: 'Um' },
          { fitid: 'FIT-14', dtposted: '20260113', trnamt: '20.00', name: 'Dois' },
        ]),
      );

      const report = await service.importOfx(file, user);

      expect(report.total).toBe(2);
      expect(report.errors).toEqual([]);
    });

    it('extrato com duas contas (STMTTRNRS vira array no parser)', async () => {
      const { service } = serviceWith();
      const report = await service.importOfx(fileOf(ofxComDuasContas()), user);

      expect(report.total).toBe(2);
      expect(report.errors).toEqual([]);
    });
  });

  describe('stringField (métodos auxiliares de parsing)', () => {
    it('retorna null quando o nó não é um objeto', () => {
      const { service } = serviceWith();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((service as any).stringField(null, 'FITID')).toBeNull();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((service as any).stringField('texto', 'FITID')).toBeNull();
    });

    it('retorna null quando o valor é string vazia após trim', () => {
      const { service } = serviceWith();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((service as any).stringField({ NAME: '   ' }, 'NAME')).toBeNull();
    });
  });

  describe('findUnmatched', () => {
    it('filtra por tenant, congregação e financial_transaction_id nulo', async () => {
      const { service, bankStatementTransactionClient } = serviceWith();
      bankStatementTransactionClient.findMany.mockResolvedValue([{ id: 'bst-1' }]);
      bankStatementTransactionClient.count.mockResolvedValue(1);

      const result = await service.findUnmatched({ page: 1, limit: 20 }, user);

      expect(bankStatementTransactionClient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenant_id: 'tenant-1',
            congregation_id: 'cong-1',
            financial_transaction_id: null,
          },
        }),
      );
      expect(result).toEqual({ data: [{ id: 'bst-1' }], total: 1, page: 1, limit: 20 });
    });

    it('filtra por import_job_id quando informado', async () => {
      const { service, bankStatementTransactionClient } = serviceWith();

      await service.findUnmatched({ page: 1, limit: 20, import_job_id: 'job-9' }, user);

      expect(bankStatementTransactionClient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ import_job_id: 'job-9' }),
        }),
      );
    });
  });
});
