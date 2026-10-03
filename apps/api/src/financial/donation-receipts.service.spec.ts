import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DonationReceiptService } from './donation-receipts.service';
// Importado só para o describe whitebox abaixo forçar o pdfmake a de fato
// invocar as duas closures que `donation-receipts.service.ts` registra na
// importação (setLocalAccessPolicy/setUrlAccessPolicy) — sem isso elas nunca
// são chamadas neste sandbox de módulos, e ficam fora da cobertura. Mesmo
// padrão de `dre-pdf.service.spec.ts`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfmakeLib = require('pdfmake') as {
  createPdf: (def: object, opts: object) => { getBuffer: () => Promise<Buffer> };
};
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
    /** `set_config(tenant, congregação)` de cada bloco com escopo. */
    contexts: [] as unknown[][],
    /** Quantos blocos de `runInTx` abriram. */
    transactions: 0,
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

  const tx = {
    $executeRaw: (_strings: TemplateStringsArray, ...valores: unknown[]) => {
      cap.contexts.push(valores);
      return Promise.resolve(1);
    },
  };
  const prisma = {
    client,
    runInTx: (fn: (t: typeof tx) => Promise<unknown>) => {
      cap.transactions++;
      return fn(tx);
    },
  } as unknown as PrismaService;

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

  it('sem tenant encontrado, o PDF cai para o nome padrão "Igreja"', async () => {
    const { service, cap } = harness({ tenant: null });

    await service.generateForTransaction('tx-1');

    expect(cap.created).toHaveLength(1);
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

describe('DonationReceiptService.generateForTransaction — escopo de RLS (webhook sem JWT)', () => {
  const scope = { tenantId: 't1', congregationId: 'c1' };

  it('com escopo, fixa app.tenant_id/app.congregation_id na leitura e de novo na gravação do recibo', async () => {
    const { service, cap } = harness();

    await service.generateForTransaction('tx-1', scope);

    expect(cap.transactions).toBe(2);
    expect(cap.contexts).toEqual([
      ['t1', 'c1'],
      ['t1', 'c1'],
    ]);
    expect(cap.created).toHaveLength(1);
  });

  it('PDF, upload e e-mail ficam fora da transação — só leitura e gravação seguram conexão', async () => {
    const { service, cap, client } = harness();
    let abertas = 0;
    let uploadComTransacaoAberta = false;
    // Mede, no instante do upload, quantas transações do `runInTx` estão abertas.
    (service as unknown as { prisma: { runInTx: unknown } }).prisma.runInTx = async (
      fn: (t: { $executeRaw: () => Promise<number> }) => Promise<unknown>,
    ) => {
      abertas++;
      try {
        return await fn({ $executeRaw: () => Promise.resolve(1) });
      } finally {
        abertas--;
      }
    };
    (service as unknown as { storage: { upload: unknown } }).storage.upload = jest.fn(() => {
      uploadComTransacaoAberta = abertas > 0;
      return Promise.resolve('https://cdn.test/x.pdf');
    });

    await service.generateForTransaction('tx-1', scope);

    expect(uploadComTransacaoAberta).toBe(false);
    expect(client.donationReceipt.create).toHaveBeenCalledTimes(1);
    expect(cap.mails).toHaveLength(1);
  });

  it('sem escopo, não abre transação nem fixa contexto (quem chama já está sob um)', async () => {
    const { service, cap } = harness();

    await service.generateForTransaction('tx-1');

    expect(cap.transactions).toBe(0);
    expect(cap.contexts).toEqual([]);
  });

  it('com escopo, transação já com recibo não grava outro', async () => {
    const { service, cap } = harness({ donationReceipt: { id: 'ja-existe' } });

    await service.generateForTransaction('tx-1', scope);

    expect(cap.transactions).toBe(1);
    expect(cap.created).toEqual([]);
  });
});

describe('DonationReceiptService.generateForTransaction — doador declarado da doação pública (DPUB-25)', () => {
  const publica = (extra: Record<string, unknown> = {}) => ({
    id: 'tx-1',
    tenant_id: 't1',
    amount: new Prisma.Decimal('80.00'),
    occurred_at: new Date('2026-05-10T12:00:00.000Z'),
    donor_person_id: null,
    is_anonymous: false,
    type: 'income',
    ...extra,
  });
  const declarado = { name: 'Ana Declarada', email: 'ana@declarada.com' };

  it('recibo vai para o e-mail declarado, sem Person: grava recipient_*, não person_id', async () => {
    const { service, cap, client } = harness({ transaction: publica() });

    await service.generateForTransaction('tx-1', undefined, declarado);

    expect(cap.created).toEqual([
      {
        tenant_id: 't1',
        transaction_id: 'tx-1',
        recipient_name: 'Ana Declarada',
        recipient_email: 'ana@declarada.com',
        receipt_url: 'https://cdn.test/donation-receipts/t1/tx-1.pdf',
      },
    ]);
    expect(cap.created[0]).not.toHaveProperty('person_id');
    expect(cap.mails).toEqual([
      {
        to: 'ana@declarada.com',
        name: 'Ana Declarada',
        amount: 80,
        url: 'https://cdn.test/donation-receipts/t1/tx-1.pdf',
      },
    ]);
    // Não há Person para consultar.
    expect(client.person.findUnique).not.toHaveBeenCalled();
  });

  it('sem nome declarado, o recibo e o e-mail usam o próprio endereço como nome e recipient_name fica nulo', async () => {
    const { service, cap } = harness({ transaction: publica() });

    await service.generateForTransaction('tx-1', undefined, { name: null, email: 'ana@declarada.com' });

    expect(cap.created[0]).toMatchObject({ recipient_name: null, recipient_email: 'ana@declarada.com' });
    expect(cap.mails[0]).toMatchObject({ to: 'ana@declarada.com', name: 'ana@declarada.com' });
  });

  it('é Premium: tenant Starter não emite recibo nem para o doador declarado', async () => {
    const { service, cap } = harness({ transaction: publica(), tenantPlan: { plan: 'starter' } });

    await service.generateForTransaction('tx-1', undefined, declarado);

    expect(cap.uploads).toEqual([]);
    expect(cap.created).toEqual([]);
    expect(cap.mails).toEqual([]);
  });

  it('sem plano cadastrado também não emite', async () => {
    const { service, cap } = harness({ transaction: publica(), tenantPlan: null });

    await service.generateForTransaction('tx-1', undefined, declarado);

    expect(cap.mails).toEqual([]);
  });

  it('doação anônima (nem Person, nem doador declarado): nada', async () => {
    const { service, cap } = harness({ transaction: publica() });

    await service.generateForTransaction('tx-1');

    expect(cap.uploads).toEqual([]);
    expect(cap.created).toEqual([]);
    expect(cap.mails).toEqual([]);
  });

  it('lançamento marcado `is_anonymous` não recebe recibo, mesmo com doador declarado', async () => {
    const { service, cap } = harness({ transaction: publica({ is_anonymous: true }) });

    await service.generateForTransaction('tx-1', undefined, declarado);

    expect(cap.mails).toEqual([]);
    expect(cap.created).toEqual([]);
  });

  it('com Person vinculada, a Person vence o doador declarado (grava person_id, escreve para o e-mail dela)', async () => {
    const { service, cap } = harness({ transaction: publica({ donor_person_id: 'pessoa-1' }) });

    await service.generateForTransaction('tx-1', undefined, declarado);

    expect(cap.created).toEqual([
      {
        tenant_id: 't1',
        transaction_id: 'tx-1',
        person_id: 'pessoa-1',
        receipt_url: 'https://cdn.test/donation-receipts/t1/tx-1.pdf',
      },
    ]);
    expect(cap.mails[0]).toMatchObject({ to: 'maria@test.com', name: 'Maria' });
  });

  it('Person vinculada sem e-mail NÃO cai para o declarado: é doador cadastrado sem endereço', async () => {
    const { service, cap } = harness({
      transaction: publica({ donor_person_id: 'pessoa-1' }),
      person: { full_name: 'Maria', email: null },
    });

    await service.generateForTransaction('tx-1', undefined, declarado);

    expect(cap.mails).toEqual([]);
    expect(cap.created).toEqual([]);
  });

  it('doador cadastrado cuja Person já não existe NÃO cai para o declarado: sem recibo', async () => {
    const { service, cap } = harness({ transaction: publica({ donor_person_id: 'pessoa-removida' }), person: null });

    await service.generateForTransaction('tx-1', undefined, declarado);

    expect(cap.mails).toEqual([]);
    expect(cap.created).toEqual([]);
  });

  it('com escopo de RLS, o recibo declarado também lê e grava sob o contexto do tenant', async () => {
    const { service, cap } = harness({ transaction: publica() });

    await service.generateForTransaction('tx-1', { tenantId: 't1', congregationId: 'c1' }, declarado);

    expect(cap.contexts).toEqual([
      ['t1', 'c1'],
      ['t1', 'c1'],
    ]);
    expect(cap.created).toHaveLength(1);
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

describe('DonationReceiptService.list — recibo de doador público (sem Person)', () => {
  const row = (extra: Record<string, unknown>) => ({
    id: 'r2',
    receipt_url: 'https://cdn.test/y.pdf',
    generated_at: new Date('2026-05-10T00:00:00.000Z'),
    person: null,
    recipient_name: null,
    recipient_email: null,
    transaction: { amount: new Prisma.Decimal('20.00'), occurred_at: new Date('2026-05-09T00:00:00.000Z') },
    ...extra,
  });

  async function nameFor(extra: Record<string, unknown>) {
    const { service, client } = harness();
    (client.donationReceipt as unknown as { findMany: jest.Mock; count: jest.Mock }).findMany = jest
      .fn()
      .mockResolvedValue([row(extra)]);
    (client.donationReceipt as unknown as { count: jest.Mock }).count = jest.fn().mockResolvedValue(1);

    return (await service.list('t1', 1, 20)).data[0].person_name;
  }

  it('sem Person, mostra o nome que o doador declarou', async () => {
    expect(await nameFor({ recipient_name: 'Fulano', recipient_email: 'fulano@teste.com' })).toBe('Fulano');
  });

  it('sem Person e sem nome, mostra o e-mail declarado', async () => {
    expect(await nameFor({ recipient_email: 'fulano@teste.com' })).toBe('fulano@teste.com');
  });

  it('o nome da Person tem prioridade sobre o declarado', async () => {
    expect(
      await nameFor({ person: { full_name: 'Maria' }, recipient_name: 'Outro Nome', recipient_email: 'x@y.com' }),
    ).toBe('Maria');
  });

  it('linha sem nenhuma identificação (o CHECK do banco impede, mas a lista não quebra): string vazia', async () => {
    expect(await nameFor({})).toBe('');
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

  it('quando a URL gravada não pertence ao domínio público do storage, devolve ela direto (sem assinar)', async () => {
    const { service, client } = harness();
    (client.donationReceipt as unknown as { findFirst: jest.Mock }).findFirst = findFirstFake([
      { id: 'receipt-1', tenant_id: 't1', receipt_url: 'https://outro-dominio.test/x.pdf' },
    ]);
    const storage = (service as unknown as { storage: { keyFromUrl: jest.Mock } }).storage;
    storage.keyFromUrl.mockReturnValueOnce(null);

    const result = await service.getDownloadUrl('t1', 'receipt-1');

    expect(result).toEqual({ download_url: 'https://outro-dominio.test/x.pdf', expires_in: 0 });
  });
});

describe('políticas de acesso do pdfmake (module init, whitebox)', () => {
  // Mesmo bloqueio deliberado de `dre-pdf.service.ts`: acesso a arquivo
  // local/URL externa em qualquer PDF gerado por este serviço.
  it('bloqueia imagem apontando para caminho local/não-data (setLocalAccessPolicy)', async () => {
    const doc = pdfmakeLib.createPdf({ content: [{ image: './local/nao-existe.png' }] }, {});

    await expect(doc.getBuffer()).rejects.toThrow(/Access to local file denied/);
  });

  it('bloqueia imagem apontando para URL externa (setUrlAccessPolicy)', async () => {
    const doc = pdfmakeLib.createPdf(
      { content: [{ image: 'logo' }], images: { logo: 'https://example.com/logo.png' } },
      {},
    );

    await expect(doc.getBuffer()).rejects.toThrow(/Access to URL denied/);
  });
});
