import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DonationReceiptService } from './donation-receipts.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { MailService } from '../mail/mail.service';

type Opts = {
  donationReceipt?: { id: string } | null;
  transaction?: Record<string, unknown> | null;
  tenantPlan?: { plan: string } | null;
  person?: { full_name: string; email: string | null } | null;
  tenant?: { name: string } | null;
};

function harness(opts: Opts = {}) {
  const cap = {
    created: [] as Record<string, unknown>[],
    uploads: [] as { key: string; contentType: string }[],
    mails: [] as { to: string; name: string; amount: number; url: string }[],
  };

  const transaction =
    opts.transaction === undefined
      ? {
          id: 'tx-1',
          tenant_id: 't1',
          amount: new Prisma.Decimal('100.00'),
          occurred_at: new Date('2026-05-10T12:00:00.000Z'),
          donor_person_id: 'pessoa-1',
          is_anonymous: false,
          type: 'income',
        }
      : opts.transaction;

  const client = {
    donationReceipt: {
      findFirst: jest.fn().mockResolvedValue(opts.donationReceipt === undefined ? null : opts.donationReceipt),
      create: jest.fn((args: { data: Record<string, unknown> }) => {
        cap.created.push(args.data);
        return Promise.resolve({ id: 'receipt-1', ...args.data });
      }),
    },
    financialTransaction: {
      findUnique: jest.fn().mockResolvedValue(transaction),
    },
    tenantPlan: {
      findUnique: jest.fn().mockResolvedValue(opts.tenantPlan === undefined ? { plan: 'premium' } : opts.tenantPlan),
    },
    person: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          opts.person === undefined ? { full_name: 'Maria', email: 'maria@test.com' } : opts.person,
        ),
    },
    tenant: {
      findUnique: jest.fn().mockResolvedValue(opts.tenant === undefined ? { name: 'Igreja Central' } : opts.tenant),
    },
  };

  const prisma = { client } as unknown as PrismaService;

  const storage = {
    upload: jest.fn((_buf: Buffer, key: string, contentType: string) => {
      cap.uploads.push({ key, contentType });
      return Promise.resolve(`https://cdn.test/${key}`);
    }),
    keyFromUrl: jest.fn((url: string) => url.replace('https://cdn.test/', '')),
    getPresignedGetUrl: jest.fn().mockResolvedValue('https://cdn.test/signed'),
  } as unknown as StorageService;

  const mail = {
    sendDonationReceipt: jest.fn((to: string, name: string, amount: number, url: string) => {
      cap.mails.push({ to, name, amount, url });
      return Promise.resolve();
    }),
  } as unknown as MailService;

  return { service: new DonationReceiptService(prisma, storage, mail), client, cap };
}

describe('DonationReceiptService.generateForTransaction', () => {
  it('gera o PDF, sobe pro storage, grava o recibo e manda o email', async () => {
    const { service, cap, client } = harness();

    await service.generateForTransaction('tx-1');

    expect(cap.uploads).toEqual([{ key: 'donation-receipts/t1/tx-1.pdf', contentType: 'application/pdf' }]);
    expect(cap.created).toEqual([
      {
        tenant_id: 't1',
        transaction_id: 'tx-1',
        person_id: 'pessoa-1',
        receipt_url: 'https://cdn.test/donation-receipts/t1/tx-1.pdf',
      },
    ]);
    expect(cap.mails).toEqual([
      { to: 'maria@test.com', name: 'Maria', amount: 100, url: 'https://cdn.test/donation-receipts/t1/tx-1.pdf' },
    ]);
    expect(client.donationReceipt.create).toHaveBeenCalledTimes(1);
  });

  it('é idempotente: transação que já tem recibo não gera outro', async () => {
    const { service, cap } = harness({ donationReceipt: { id: 'ja-existe' } });

    await service.generateForTransaction('tx-1');

    expect(cap.uploads).toEqual([]);
    expect(cap.created).toEqual([]);
    expect(cap.mails).toEqual([]);
  });

  it('transação inexistente é ignorada', async () => {
    const { service, cap } = harness({ transaction: null });

    await service.generateForTransaction('tx-inexistente');

    expect(cap.created).toEqual([]);
  });

  it('despesa não gera recibo de doação', async () => {
    const { service, cap } = harness({
      transaction: {
        id: 'tx-1',
        tenant_id: 't1',
        amount: new Prisma.Decimal('100.00'),
        occurred_at: new Date(),
        donor_person_id: 'pessoa-1',
        is_anonymous: false,
        type: 'expense',
      },
    });

    await service.generateForTransaction('tx-1');

    expect(cap.created).toEqual([]);
  });

  it('doação anônima não gera recibo', async () => {
    const { service, cap } = harness({
      transaction: {
        id: 'tx-1',
        tenant_id: 't1',
        amount: new Prisma.Decimal('100.00'),
        occurred_at: new Date(),
        donor_person_id: 'pessoa-1',
        is_anonymous: true,
        type: 'income',
      },
    });

    await service.generateForTransaction('tx-1');

    expect(cap.created).toEqual([]);
  });

  it('sem doador identificado, não gera recibo', async () => {
    const { service, cap } = harness({
      transaction: {
        id: 'tx-1',
        tenant_id: 't1',
        amount: new Prisma.Decimal('100.00'),
        occurred_at: new Date(),
        donor_person_id: null,
        is_anonymous: false,
        type: 'income',
      },
    });

    await service.generateForTransaction('tx-1');

    expect(cap.created).toEqual([]);
  });

  it('tenant Starter não gera recibo — feature é Premium', async () => {
    const { service, cap } = harness({ tenantPlan: { plan: 'starter' } });

    await service.generateForTransaction('tx-1');

    expect(cap.uploads).toEqual([]);
    expect(cap.created).toEqual([]);
    expect(cap.mails).toEqual([]);
  });

  it('tenant sem TenantPlan (não devia existir) também não gera — não assume Premium', async () => {
    const { service, cap } = harness({ tenantPlan: null });

    await service.generateForTransaction('tx-1');

    expect(cap.created).toEqual([]);
  });

  it('doador sem email cadastrado não recebe recibo, mas nada quebra', async () => {
    const { service, cap } = harness({ person: { full_name: 'João', email: null } });

    await expect(service.generateForTransaction('tx-1')).resolves.toBeUndefined();

    expect(cap.uploads).toEqual([]);
    expect(cap.created).toEqual([]);
    expect(cap.mails).toEqual([]);
  });

  it('o valor do email/recibo vem do Decimal convertido para number', async () => {
    const { service, cap } = harness({
      transaction: {
        id: 'tx-1',
        tenant_id: 't1',
        amount: new Prisma.Decimal('12.34'),
        occurred_at: new Date(),
        donor_person_id: 'pessoa-1',
        is_anonymous: false,
        type: 'income',
      },
    });

    await service.generateForTransaction('tx-1');

    expect(cap.mails[0]?.amount).toBe(12.34);
  });
});

describe('DonationReceiptService.list', () => {
  it('lista recibos do tenant com dados de doador e transação', async () => {
    const { service, client } = harness();
    (client.donationReceipt as unknown as { findMany: jest.Mock; count: jest.Mock }).findMany = jest
      .fn()
      .mockResolvedValue([
        {
          id: 'r1',
          receipt_url: 'https://cdn.test/x.pdf',
          generated_at: new Date('2026-05-10T00:00:00.000Z'),
          person: { full_name: 'Maria' },
          transaction: { amount: new Prisma.Decimal('50.00'), occurred_at: new Date('2026-05-09T00:00:00.000Z') },
        },
      ]);
    (client.donationReceipt as unknown as { count: jest.Mock }).count = jest.fn().mockResolvedValue(1);

    const result = await service.list('t1', 1, 20);

    expect(result.total).toBe(1);
    expect(result.data[0]).toMatchObject({ id: 'r1', person_name: 'Maria', amount: '50' });
  });
});

describe('DonationReceiptService.getDownloadUrl', () => {
  // O fake reproduz o `WHERE id = ... AND tenant_id = ...` do Prisma de
  // verdade: só devolve a linha quando os DOIS casam. Um fake que ignorasse
  // `tenant_id` deixaria passar o cenário do vazamento entre tenants sem
  // nenhum teste reprovar — que é exatamente o gap que este describe cobre.
  function findFirstFake(rows: { id: string; tenant_id: string; receipt_url: string }[]) {
    return jest.fn((args: { where: { id: string; tenant_id: string } }) => {
      const row = rows.find((r) => r.id === args.where.id && r.tenant_id === args.where.tenant_id);
      return Promise.resolve(row ? { receipt_url: row.receipt_url } : null);
    });
  }

  it('devolve URL assinada a partir da key do storage', async () => {
    const { service, client } = harness();
    (client.donationReceipt as unknown as { findFirst: jest.Mock }).findFirst = findFirstFake([
      { id: 'receipt-1', tenant_id: 't1', receipt_url: 'https://cdn.test/donation-receipts/t1/tx-1.pdf' },
    ]);

    const result = await service.getDownloadUrl('t1', 'receipt-1');

    expect(result).toEqual({ download_url: 'https://cdn.test/signed', expires_in: 3600 });
  });

  it('recibo inexistente vira 404', async () => {
    const { service, client } = harness();
    (client.donationReceipt as unknown as { findFirst: jest.Mock }).findFirst = findFirstFake([]);

    await expect(service.getDownloadUrl('t1', 'nao-existe')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('recibo que existe mas pertence a OUTRO tenant também vira 404 — a query filtra por tenant_id, não só por id', async () => {
    const { service, client } = harness();
    (client.donationReceipt as unknown as { findFirst: jest.Mock }).findFirst = findFirstFake([
      { id: 'receipt-1', tenant_id: 't2', receipt_url: 'https://cdn.test/donation-receipts/t2/tx-9.pdf' },
    ]);

    await expect(service.getDownloadUrl('t1', 'receipt-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
