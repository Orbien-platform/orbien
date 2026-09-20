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
