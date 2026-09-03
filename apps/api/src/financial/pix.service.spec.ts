/**
 * PIX é dinheiro entrando. Três coisas nesta suíte não são "cobertura":
 *
 *   1. **O webhook é a única porta em que um terceiro escreve no financeiro.**
 *      A autenticação é um token em env; sem ele, TODA requisição tem que ser
 *      401 — inclusive a que não manda token nenhum. Um `!expected` que
 *      liberasse em vez de barrar abriria a criação de receita para a internet.
 *   2. **`resolveTenantAdmin` põe o id de um usuário real como autor de
 *      lançamento criado por robô.** Se ele mudar de tenant, o lançamento é
 *      atribuído a quem não fez.
 *   3. **`website` é honeypot.** Bot que preenche o campo recebe resposta
 *      plausível e vazia, e nada é gravado. Se o teste do honeypot cair, o
 *      formulário público volta a virar canal de flood.
 *
 * O webhook é idempotente em dois níveis, e os testes cobrem os dois:
 *
 *   - um `if` de atalho, para o reenvio que chega depois de tudo pronto;
 *   - um `updateMany` condicional `pending → confirmed`, que é o que fecha a
 *     corrida entre duas entregas simultâneas. É o banco que decide o empate.
 *
 * O fake de `pixPayment` abaixo é ESTADO, não constante: o `updateMany` só
 * "pega" quando o registro está `pending`, e altera o que o `findFirst`
 * devolve depois. Um fake que sempre aceitasse a escrita deixaria os dois
 * testes de idempotência passando sem medir nada.
 */

import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { Prisma } from '@prisma/client';
import { PixService } from './pix.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreatePixDto, CreateDynamicPixDto } from './dto/create-pix.dto';

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 't1',
  congregation_id: 'c1',
  roles: ['treasurer'],
  plan: 'premium',
};

type Opts = {
  tenant?: { id: string; name: string } | null;
  branding?: { pix_key: string | null; app_name: string | null } | null;
  congregation?: { id: string } | null;
  categories?: ({ id: string } | null)[];
  assignment?: { user_account_id: string } | null;
  pixPayment?: Record<string, unknown> | null;
  httpGet?: (url: string) => unknown;
  httpPost?: (url: string, body: unknown) => unknown;
  httpFails?: boolean;
  auditThrows?: boolean;
  /**
   * Simula a corrida: o `findFirst` devolve `pending`, mas a linha vira
   * `confirmed` logo depois — como se outra entrega tivesse confirmado entre a
   * leitura e a escrita. O `updateMany` condicional então não pega.
   */
  perdeCorrida?: boolean;
};

function harness(opts: Opts = {}) {
  const cap = {
    pixPayments: [] as Record<string, unknown>[],
    transactions: [] as Record<string, unknown>[],
    updates: [] as Record<string, unknown>[],
    audits: [] as Record<string, unknown>[],
    categoryQueries: [] as Record<string, unknown>[],
    posts: [] as { url: string; body: unknown }[],
    gets: [] as string[],
  };

  let catCall = 0;
  const categories = opts.categories ?? [{ id: 'cat-oferta' }];

  // O registro que o webhook lê e escreve. Precisa ser estado compartilhado
  // entre `findFirst` e `update`, senão o reenvio do webhook veria sempre
  // `pending` e a idempotência ficaria sem teste.
  const registro: Record<string, unknown> | null =
    opts.pixPayment === undefined
      ? {
          id: 'pix-1',
          tenant_id: 't1',
          congregation_id: 'c1',
          amount: new Prisma.Decimal('50.00'),
          category_id: 'cat-oferta',
          status: 'pending',
        }
      : opts.pixPayment;

  const tx = {
    financialTransaction: {
      create: (args: { data: Record<string, unknown> }) => {
        cap.transactions.push(args.data);
        return Promise.resolve({ id: 'tx-1' });
      },
    },
    pixPayment: {
      create: (args: { data: Record<string, unknown> }) => {
        cap.pixPayments.push(args.data);
        return Promise.resolve({ id: 'pix-1' });
      },
      // Reproduz o `WHERE status = 'pending'` do serviço: a escrita só pega
      // quando a condição bate, e devolve `count` como o Prisma devolveria.
      updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        cap.updates.push(args);

        const casa =
          registro !== null &&
          Object.entries(args.where).every(([k, v]) => registro[k] === v);

        if (!casa) return Promise.resolve({ count: 0 });

        Object.assign(registro, args.data);
        return Promise.resolve({ count: 1 });
      },
    },
  };

  const prisma = {
    client: {
      tenant: {
        findUnique: () =>
          Promise.resolve(
            opts.tenant === undefined ? { id: 't1', name: 'Igreja Central' } : opts.tenant,
          ),
      },
      brandingConfig: {
        findUnique: () =>
          Promise.resolve(
            opts.branding === undefined
              ? { pix_key: 'chave@igreja.test', app_name: 'App da Igreja' }
              : opts.branding,
          ),
      },
      congregation: {
        findFirst: () =>
          Promise.resolve(opts.congregation === undefined ? { id: 'c1' } : opts.congregation),
      },
      financialCategory: {
        findFirst: (args: { where: Record<string, unknown> }) => {
          cap.categoryQueries.push(args.where);
          return Promise.resolve(categories[catCall++] ?? null);
        },
      },
      roleAssignment: {
        findFirst: () =>
          Promise.resolve(
            opts.assignment === undefined ? { user_account_id: 'admin-1' } : opts.assignment,
          ),
      },
      pixPayment: {
        create: (args: { data: Record<string, unknown> }) => {
          cap.pixPayments.push(args.data);
          return Promise.resolve({ id: 'pix-1' });
        },
        findFirst: () => {
          const lido = registro ? { ...registro } : null;
          if (opts.perdeCorrida && registro) registro['status'] = 'confirmed';
          return Promise.resolve(lido);
        },
      },
      auditLog: {
        create: (args: { data: Record<string, unknown> }) => {
          if (opts.auditThrows) return Promise.reject(new Error('audit fora do ar'));
          cap.audits.push(args.data);
          return Promise.resolve({});
        },
      },
    },
    runInTx: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  } as unknown as PrismaService;

  const http = {
    get: (url: string) => {
      cap.gets.push(url);
      if (opts.httpFails) return throwError(() => new Error('asaas fora do ar'));
      return of({
        data:
          opts.httpGet?.(url) ??
          (url.includes('/customers')
            ? { data: [{ id: 'cus_1' }] }
            : {
                encodedImage: 'iVBORw0KG',
                payload: '00020126...br.gov.bcb.pix',
                expirationDate: '2026-01-02 12:00:00',
              }),
      });
    },
    post: (url: string, body: unknown) => {
      cap.posts.push({ url, body });
      if (opts.httpFails) return throwError(() => new Error('asaas fora do ar'));
      return of({
        data:
          opts.httpPost?.(url, body) ??
          (url.includes('/customers')
            ? { id: 'cus_novo' }
            : { id: 'pay_123', invoiceUrl: 'https://asaas.test/i/1' }),
      });
    },
  } as unknown as HttpService;

  return { service: new PixService(prisma, http), cap };
}

const manualDto: CreatePixDto = { tenant_slug: 'igreja-central', amount: 50 };

describe('PixService', () => {
  const envOriginal = { ...process.env };

  afterEach(() => {
    process.env = { ...envOriginal };
    jest.restoreAllMocks();
  });

  describe('createManual', () => {
    it('devolve a chave PIX e o nome da igreja, e registra o pagamento pendente', async () => {
      const { service, cap } = harness();

      const result = await service.createManual(manualDto);

      expect(result).toEqual({
        pix_key: 'chave@igreja.test',
        amount: 50,
        church_name: 'App da Igreja',
      });
      expect(cap.pixPayments).toHaveLength(1);
      expect(cap.pixPayments[0]).toMatchObject({
        scenario: 'manual',
        status: 'pending',
        pix_key: 'chave@igreja.test',
        category_id: 'cat-oferta',
      });
    });

    it('honeypot: `website` preenchido devolve resposta vazia e não grava nada', async () => {
      const { service, cap } = harness();

      const result = await service.createManual({ ...manualDto, website: 'http://spam' });

      expect(result).toEqual({ pix_key: '', amount: 50, church_name: '' });
      expect(cap.pixPayments).toEqual([]);
      // Nem chega a consultar o tenant — o bot não gasta banco.
      expect(cap.categoryQueries).toEqual([]);
    });

    it('o valor vira Decimal', async () => {
      const { service, cap } = harness();

      await service.createManual({ ...manualDto, amount: 12.34 });

      expect(cap.pixPayments[0]?.['amount']).toBeInstanceOf(Prisma.Decimal);
      expect(String(cap.pixPayments[0]?.['amount'])).toBe('12.34');
    });

    it('slug inexistente vira 404', async () => {
      const { service } = harness({ tenant: null });

      await expect(service.createManual(manualDto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('igreja sem chave PIX configurada vira 400', async () => {
      const { service } = harness({ branding: null });

      await expect(service.createManual(manualDto)).rejects.toThrow(
        'Igreja não configurou chave PIX',
      );
    });

    it('branding existente mas com `pix_key` nula também vira 400', async () => {
      const { service } = harness({ branding: { pix_key: null, app_name: 'X' } });

      await expect(service.createManual(manualDto)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('tenant sem congregação vira 404', async () => {
      const { service } = harness({ congregation: null });

      await expect(service.createManual(manualDto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('sem `app_name` no branding, cai para o nome do tenant', async () => {
      const { service } = harness({
        branding: { pix_key: 'k', app_name: null },
      });

      const result = await service.createManual(manualDto);

      expect(result.church_name).toBe('Igreja Central');
    });
  });

  describe('resolveCategory', () => {
    it('usa o `category_slug` pedido', async () => {
      const { service, cap } = harness();

      await service.createManual({ ...manualDto, category_slug: 'dizimo' });

      expect(cap.categoryQueries[0]?.['name']).toEqual({
        contains: 'dizimo',
        mode: 'insensitive',
      });
    });

    it('sem slug, procura por "oferta"', async () => {
      const { service, cap } = harness();

      await service.createManual(manualDto);

      expect(cap.categoryQueries[0]?.['name']).toEqual({
        contains: 'oferta',
        mode: 'insensitive',
      });
    });

    it('slug que não casa cai para "Oferta" numa segunda consulta', async () => {
      const { service, cap } = harness({ categories: [null, { id: 'cat-fallback' }] });

      await service.createManual({ ...manualDto, category_slug: 'inexistente' });

      expect(cap.categoryQueries).toHaveLength(2);
      expect(cap.categoryQueries[1]?.['name']).toEqual({
        contains: 'Oferta',
        mode: 'insensitive',
      });
      expect(cap.pixPayments[0]?.['category_id']).toBe('cat-fallback');
    });

    it('sem categoria de receita nenhuma, vira 400', async () => {
      const { service } = harness({ categories: [null, null] });

      await expect(service.createManual(manualDto)).rejects.toThrow(
        'Categoria de receita não encontrada',
      );
    });

    it('só aceita categoria de receita — despesa não serve para doação', async () => {
      const { service, cap } = harness();

      await service.createManual(manualDto);

      expect(cap.categoryQueries[0]?.['type']).toBe('income');
    });
  });

  describe('createDynamic', () => {
    const dto: CreateDynamicPixDto = { amount: 75 };

    beforeEach(() => {
      process.env['ASAAS_API_KEY'] = 'chave-asaas';
      process.env['ASAAS_API_URL'] = 'https://asaas.test/v3';
    });

    it('sem chave da Asaas configurada, responde 503 antes de tocar no banco', async () => {
      delete process.env['ASAAS_API_KEY'];
      const { service, cap } = harness();

      await expect(service.createDynamic(dto, user)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(cap.pixPayments).toEqual([]);
    });

    it('devolve o QR e grava o pagamento com o id da Asaas', async () => {
      const { service, cap } = harness();

      const result = await service.createDynamic(dto, user);

      expect(result).toEqual({
        payment_id: 'pix-1',
        qr_code: '00020126...br.gov.bcb.pix',
        qr_code_image: 'iVBORw0KG',
        amount: 75,
        expires_at: '2026-01-02 12:00:00',
      });
      expect(cap.pixPayments[0]).toMatchObject({
        scenario: 'dynamic',
        status: 'pending',
        asaas_payment_id: 'pay_123',
        qr_code: '00020126...br.gov.bcb.pix',
      });
    });

    it('reaproveita o customer da Asaas quando já existe para o tenant', async () => {
      const { service, cap } = harness();

      await service.createDynamic(dto, user);

      expect(cap.gets[0]).toBe(
        'https://asaas.test/v3/customers?externalReference=t1&limit=1',
      );
      // Só o POST de /payments — nenhum POST de /customers.
      expect(cap.posts.map((p) => p.url)).toEqual(['https://asaas.test/v3/payments']);
    });

    it('cria o customer quando a Asaas não tem nenhum para o tenant', async () => {
      const { service, cap } = harness({
        httpGet: (url) =>
          url.includes('/customers')
            ? { data: [] }
            : {
                encodedImage: 'img',
                payload: 'qr',
                expirationDate: '2026-01-02 12:00:00',
              },
      });

      await service.createDynamic(dto, user);

      expect(cap.posts[0]?.url).toBe('https://asaas.test/v3/customers');
      expect(cap.posts[0]?.body).toEqual({
        name: 'App da Igreja',
        externalReference: 't1',
      });
    });

    it('a cobrança vence em 24h e leva referência externa própria', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-05-10T12:00:00.000Z'));
      try {
        const { service, cap } = harness();

        await service.createDynamic(dto, user);

        const body = cap.posts.find((p) => p.url.endsWith('/payments'))?.body as Record<
          string,
          unknown
        >;
        expect(body['dueDate']).toBe('2026-05-11');
        expect(body['billingType']).toBe('PIX');
        expect(body['value']).toBe(75);
        expect(String(body['externalReference'])).toMatch(/^ORB-[0-9A-Z]{6}$/);
      } finally {
        jest.useRealTimers();
      }
    });

    it('sem descrição, manda a descrição padrão', async () => {
      const { service, cap } = harness();

      await service.createDynamic(dto, user);

      const body = cap.posts.find((p) => p.url.endsWith('/payments'))?.body as Record<
        string,
        unknown
      >;
      expect(body['description']).toBe('Doação via Orbien');
    });

    it('descrição enviada é repassada', async () => {
      const { service, cap } = harness();

      await service.createDynamic({ ...dto, description: 'Campanha do telhado' }, user);

      const body = cap.posts.find((p) => p.url.endsWith('/payments'))?.body as Record<
        string,
        unknown
      >;
      expect(body['description']).toBe('Campanha do telhado');
    });

    it('amarra o doador quando informado', async () => {
      const { service, cap } = harness();

      await service.createDynamic({ ...dto, donor_person_id: 'pessoa-7' }, user);

      expect(cap.pixPayments[0]?.['donor_person_id']).toBe('pessoa-7');
    });

    it('Asaas fora do ar vira 503 e NÃO grava pagamento órfão', async () => {
      // A ordem importa: primeiro a Asaas, só depois o banco. Se invertesse,
      // uma falha externa deixaria pagamento `pending` que nunca confirma.
      const { service, cap } = harness({ httpFails: true });

      await expect(service.createDynamic(dto, user)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(cap.pixPayments).toEqual([]);
    });

    it('a mensagem de 503 não vaza detalhe da Asaas para o cliente', async () => {
      const { service } = harness({ httpFails: true });

      await expect(service.createDynamic(dto, user)).rejects.toThrow(
        'Serviço PIX indisponível',
      );
    });

    it('usa a URL de sandbox quando `ASAAS_API_URL` não está definida', async () => {
      delete process.env['ASAAS_API_URL'];
      const { service, cap } = harness();

      await service.createDynamic(dto, user);

      expect(cap.gets[0]).toContain('https://sandbox.asaas.com/api/v3');
    });

    it('igreja sem chave PIX vira 400 mesmo com a Asaas configurada', async () => {
      const { service } = harness({ branding: null });

      await expect(service.createDynamic(dto, user)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('usuário cujo tenant não tem congregação vira 404', async () => {
      const { service } = harness({ congregation: null });

      await expect(service.createDynamic(dto, user)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('sem `app_name`, o nome do customer cai para o nome do tenant', async () => {
      const { service, cap } = harness({
        branding: { pix_key: 'k', app_name: null },
        httpGet: (url) => (url.includes('/customers') ? { data: [] } : { encodedImage: '', payload: '', expirationDate: '' }),
      });

      await service.createDynamic(dto, user);

      expect((cap.posts[0]?.body as { name: string }).name).toBe('Igreja Central');
    });

    it('tenant sem nome no banco vira string vazia, não `undefined`', async () => {
      const { service, cap } = harness({
        branding: { pix_key: 'k', app_name: null },
        tenant: null,
        httpGet: (url) => (url.includes('/customers') ? { data: [] } : { encodedImage: '', payload: '', expirationDate: '' }),
      });

      await service.createDynamic(dto, user);

      expect((cap.posts[0]?.body as { name: string }).name).toBe('');
    });
  });

  describe('createPublicDonation', () => {
    it('cria lançamento e pagamento na MESMA transação', async () => {
      const { service, cap } = harness();

      const result = await service.createPublicDonation(manualDto);

      expect(cap.transactions).toHaveLength(1);
      expect(cap.pixPayments).toHaveLength(1);
      expect(result.pix_key).toBe('chave@igreja.test');
      expect(result.transaction_ref).toMatch(/^PIX-[0-9A-Z]{6}$/);
    });

    it('a referência curta do retorno é a mesma gravada em `notes`', async () => {
      // É por ela que o tesoureiro casa o extrato bancário com o lançamento.
      const { service, cap } = harness();

      const result = await service.createPublicDonation(manualDto);

      expect(result.transaction_ref).toBe(`PIX-${String(cap.transactions[0]?.['notes'])}`);
    });

    it('honeypot: `website` preenchido não grava nada', async () => {
      const { service, cap } = harness();

      const result = await service.createPublicDonation({
        ...manualDto,
        website: 'http://spam',
      });

      expect(result).toEqual({
        pix_key: '',
        amount: 50,
        church_name: '',
        transaction_ref: '',
      });
      expect(cap.transactions).toEqual([]);
      expect(cap.pixPayments).toEqual([]);
    });

    it('nome do doador entra na descrição do lançamento', async () => {
      const { service, cap } = harness();

      await service.createPublicDonation({ ...manualDto, donor_name: 'Maria' });

      expect(cap.transactions[0]?.['description']).toBe('Doação pública — Maria');
    });

    it('sem nome do doador, a descrição é genérica', async () => {
      const { service, cap } = harness();

      await service.createPublicDonation(manualDto);

      expect(cap.transactions[0]?.['description']).toBe('Doação pública');
    });

    it('o autor do lançamento é o tenant_admin, não o doador anônimo', async () => {
      // A rota é pública: não há usuário logado para responder pelo
      // lançamento. O serviço atribui ao admin do tenant.
      const { service, cap } = harness();

      await service.createPublicDonation(manualDto);

      expect(cap.transactions[0]?.['created_by_user_id']).toBe('admin-1');
      expect(cap.transactions[0]?.['source']).toBe('manual');
    });

    it('tenant sem `tenant_admin` vira 404 e não grava nada', async () => {
      const { service, cap } = harness({ assignment: null });

      await expect(service.createPublicDonation(manualDto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(cap.transactions).toEqual([]);
    });

    it('o pagamento fica no cenário `public`', async () => {
      const { service, cap } = harness();

      await service.createPublicDonation(manualDto);

      expect(cap.pixPayments[0]).toMatchObject({ scenario: 'public', status: 'pending' });
    });
  });

  describe('handleWebhook — autenticação', () => {
    it('sem `ASAAS_WEBHOOK_TOKEN` no ambiente, TODA requisição é 401', async () => {
      // O guarda é `!expected || token !== expected`. Prende a ordem: env
      // ausente barra em vez de liberar. Invertido, a rota viraria criação de
      // receita aberta na internet.
      delete process.env['ASAAS_WEBHOOK_TOKEN'];
      const { service } = harness();

      await expect(service.handleWebhook({ event: 'PAYMENT_CONFIRMED' }, undefined))
        .rejects.toBeInstanceOf(UnauthorizedException);
      await expect(service.handleWebhook({ event: 'PAYMENT_CONFIRMED' }, 'qualquer'))
        .rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('token errado é 401', async () => {
      process.env['ASAAS_WEBHOOK_TOKEN'] = 'segredo';
      const { service } = harness();

      await expect(
        service.handleWebhook({ event: 'PAYMENT_CONFIRMED' }, 'errado'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('token ausente é 401 mesmo com env configurada', async () => {
      process.env['ASAAS_WEBHOOK_TOKEN'] = 'segredo';
      const { service } = harness();

      await expect(
        service.handleWebhook({ event: 'PAYMENT_CONFIRMED' }, undefined),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('401 não grava nada', async () => {
      process.env['ASAAS_WEBHOOK_TOKEN'] = 'segredo';
      const { service, cap } = harness();

      await expect(
        service.handleWebhook({ event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_123' } }, 'x'),
      ).rejects.toThrow();
      expect(cap.transactions).toEqual([]);
      expect(cap.updates).toEqual([]);
    });
  });

  describe('handleWebhook — eventos', () => {
    beforeEach(() => {
      process.env['ASAAS_WEBHOOK_TOKEN'] = 'segredo';
    });

    it('confirma o pagamento e cria o lançamento de receita', async () => {
      const { service, cap } = harness();

      const result = await service.handleWebhook(
        { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_123', value: 75.5 } },
        'segredo',
      );

      expect(result).toEqual({ received: true });
      expect(cap.updates[0]).toMatchObject({ where: { id: 'pix-1' } });
      expect(cap.transactions[0]).toMatchObject({
        type: 'income',
        description: 'PIX confirmado via Asaas',
        source: 'pix_webhook',
        created_by_user_id: 'admin-1',
        category_id: 'cat-oferta',
      });
      expect(String(cap.transactions[0]?.['amount'])).toBe('75.5');
    });

    it('`PAYMENT_RECEIVED` também confirma', async () => {
      const { service, cap } = harness();

      await service.handleWebhook(
        { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_123' } },
        'segredo',
      );

      expect(cap.transactions).toHaveLength(1);
    });

    it.each(['PAYMENT_CREATED', 'PAYMENT_OVERDUE', 'PAYMENT_DELETED', undefined])(
      'evento %p é ignorado sem efeito',
      async (event) => {
        const { service, cap } = harness();

        const result = await service.handleWebhook({ event }, 'segredo');

        expect(result).toEqual({ received: true });
        expect(cap.transactions).toEqual([]);
        expect(cap.updates).toEqual([]);
      },
    );

    it('sem `payment.id` no corpo, loga e ignora', async () => {
      const { service, cap } = harness();

      const result = await service.handleWebhook({ event: 'PAYMENT_CONFIRMED' }, 'segredo');

      expect(result).toEqual({ received: true });
      expect(cap.transactions).toEqual([]);
    });

    it('`payment` presente mas sem `id` também é ignorado', async () => {
      const { service, cap } = harness();

      await service.handleWebhook(
        { event: 'PAYMENT_CONFIRMED', payment: {} },
        'segredo',
      );

      expect(cap.transactions).toEqual([]);
    });

    it('pagamento desconhecido é ignorado — não inventa lançamento', async () => {
      // Um `asaas_payment_id` que não está no banco pode ser de outro
      // ambiente (sandbox × produção compartilhando webhook). Criar receita
      // aqui seria inventar dinheiro.
      const { service, cap } = harness({ pixPayment: null });

      const result = await service.handleWebhook(
        { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_desconhecido' } },
        'segredo',
      );

      expect(result).toEqual({ received: true });
      expect(cap.transactions).toEqual([]);
    });

    it('sem `value` no corpo, usa o valor gravado no pagamento', async () => {
      const { service, cap } = harness();

      await service.handleWebhook(
        { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_123' } },
        'segredo',
      );

      expect(String(cap.transactions[0]?.['amount'])).toBe('50');
    });

    it('`value: 0` cai para o valor gravado — o guarda é truthy, não `!== undefined`', async () => {
      // Prende a diferença: `payload.payment.value ? ... : pixPayment.amount`.
      // Um webhook com valor zero não zera o lançamento; usa o valor da
      // cobrança. É o comportamento atual, e provavelmente o desejado.
      const { service, cap } = harness();

      await service.handleWebhook(
        { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_123', value: 0 } },
        'segredo',
      );

      expect(String(cap.transactions[0]?.['amount'])).toBe('50');
    });

    it('o valor da Asaas vem como string para o Decimal, sem passar por float', async () => {
      const { service, cap } = harness();

      await service.handleWebhook(
        { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_123', value: 0.1 } },
        'segredo',
      );

      expect(String(cap.transactions[0]?.['amount'])).toBe('0.1');
    });

    it('deixa rastro em audit_logs', async () => {
      const { service, cap } = harness();

      await service.handleWebhook(
        { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_123' } },
        'segredo',
      );

      expect(cap.audits[0]).toMatchObject({
        entity: 'pix_payment',
        action: 'pix.confirmed',
        actor_user_id: 'admin-1',
        after: { asaas_payment_id: 'pay_123', event: 'PAYMENT_CONFIRMED' },
      });
    });

    it('tenant sem admin faz o webhook falhar antes de gravar', async () => {
      const { service, cap } = harness({ assignment: null });

      await expect(
        service.handleWebhook(
          { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_123' } },
          'segredo',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(cap.transactions).toEqual([]);
    });

    it('falha da auditoria não derruba o webhook nem desfaz o lançamento', async () => {
      // O `.catch(() => void 0)` roda sem `await`: se a auditoria rejeitasse
      // sem tratamento, seria unhandled rejection derrubando o processo. E
      // devolver erro à Asaas faria ela reenviar o evento — que, sem
      // idempotência, dobraria a receita. Ver o teste seguinte.
      const { service, cap } = harness({ auditThrows: true });

      const result = await service.handleWebhook(
        { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_123' } },
        'segredo',
      );

      expect(result).toEqual({ received: true });
      expect(cap.transactions).toHaveLength(1);
      expect(cap.audits).toEqual([]);
    });

    it('é idempotente: o mesmo evento duas vezes cria UM lançamento', async () => {
      // O caso que motivou a correção. A Asaas reenvia o webhook quando não
      // recebe 200 a tempo; antes, cada reenvio criava outro lançamento e a
      // receita aparecia dobrada no DRE sem nenhum erro à vista.
      const { service, cap } = harness();
      const evento = { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_123', value: 50 } };

      const primeira = await service.handleWebhook(evento, 'segredo');
      const segunda = await service.handleWebhook(evento, 'segredo');

      // As duas respostas são 200: recusar a segunda faria a Asaas tentar de
      // novo para sempre.
      expect(primeira).toEqual({ received: true });
      expect(segunda).toEqual({ received: true });
      expect(cap.transactions).toHaveLength(1);
      expect(cap.updates).toHaveLength(1);
    });

    it('`PAYMENT_RECEIVED` depois de `PAYMENT_CONFIRMED` não duplica', async () => {
      // A Asaas manda os dois eventos para o mesmo pagamento, e ambos caem no
      // ramo de confirmação. Este é o caminho de duplicação que acontece
      // sozinho, sem falha de rede nenhuma.
      const { service, cap } = harness();

      await service.handleWebhook(
        { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_123', value: 50 } },
        'segredo',
      );
      await service.handleWebhook(
        { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_123', value: 50 } },
        'segredo',
      );

      expect(cap.transactions).toHaveLength(1);
    });

    it('entrega simultânea: quem perde a corrida no banco não cria lançamento', async () => {
      // O `if` de atalho NÃO cobre este caso: quando ele roda, a linha ainda
      // está `pending`. Entre ele e a escrita há dois `await`, e é aí que a
      // outra entrega confirma. Só o `updateMany` condicional segura.
      const { service, cap } = harness({ perdeCorrida: true });

      const result = await service.handleWebhook(
        { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_123' } },
        'segredo',
      );

      // Continua 200: recusar faria a Asaas reenviar para sempre.
      expect(result).toEqual({ received: true });
      // A tentativa de escrita aconteceu e não pegou; nenhum lançamento saiu.
      expect(cap.updates).toHaveLength(1);
      expect(cap.transactions).toEqual([]);
      // E não audita uma confirmação que não foi desta entrega.
      expect(cap.audits).toEqual([]);
    });

    it('pagamento que já chegou `confirmed` do banco é ignorado de saída', async () => {
      const { service, cap } = harness({
        pixPayment: {
          id: 'pix-1',
          tenant_id: 't1',
          congregation_id: 'c1',
          amount: new Prisma.Decimal('50.00'),
          category_id: 'cat-oferta',
          status: 'confirmed',
        },
      });

      const result = await service.handleWebhook(
        { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_123' } },
        'segredo',
      );

      expect(result).toEqual({ received: true });
      expect(cap.transactions).toEqual([]);
      expect(cap.updates).toEqual([]);
      // Nem consulta o admin do tenant — a guarda vem antes.
      expect(cap.audits).toEqual([]);
    });
  });
});
