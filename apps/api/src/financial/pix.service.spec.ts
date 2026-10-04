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
  ConflictException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import { of, throwError } from 'rxjs';
import { Prisma } from '@prisma/client';
import { PixService } from './pix.service';
import { PrismaService } from '../prisma/prisma.service';
import { DonationReceiptService } from './donation-receipts.service';
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
  /** Pessoa resolvida em `createSubscription` como doador (PROD-27). */
  person?: { id: string } | null;
  /**
   * Assinatura (`pix_subscriptions`) usada por `listSubscriptions`,
   * `cancelSubscription` e pelo webhook de PIX recorrente. Estado
   * compartilhado — `cancelSubscription` e o webhook leem e escrevem nela.
   */
  pixSubscription?: Record<string, unknown> | null;
  pixSubscriptions?: Record<string, unknown>[];
  httpGet?: (url: string) => unknown;
  httpPost?: (url: string, body: unknown) => unknown;
  httpDelete?: (url: string) => unknown;
  httpFails?: boolean;
  /** Só o GET cuja URL contém este trecho falha (ex.: `pixQrCode`, depois de a cobrança já existir). */
  httpGetFailsFor?: string;
  httpDeleteFails?: boolean;
  auditThrows?: boolean;
  /**
   * Simula a corrida: o `findFirst` devolve `pending`, mas a linha vira
   * `confirmed` logo depois — como se outra entrega tivesse confirmado entre a
   * leitura e a escrita. O `updateMany` condicional então não pega.
   */
  perdeCorrida?: boolean;
  /**
   * PIX recorrente (PROD-27): simula duas entregas do webhook concorrentes
   * criando o MESMO `PixPayment` reativo — a segunda `create` bate no unique
   * de `asaas_payment_id` (P2002) e precisa recarregar a linha que a
   * primeira já gravou, em vez de falhar o webhook.
   */
  raceOnReactiveCreate?: boolean;
  /** O `create` reativo falha com algo que NÃO é a unique de asaas_payment_id. */
  reactiveCreateThrowsUnknownError?: boolean;
  /** Simula falha na geração do recibo (email fora do ar, etc). */
  receiptRejects?: boolean;
  /** `count` que `tx.eventRegistration.updateMany` devolve (PROD-24). */
  eventRegistrationFinalizeCount?: number;
  /**
   * O que `pix_webhook_scope()` devolve (024). Sem isto, o fake resolve o
   * escopo `t1/c1` quando há `PixPayment` ou uma assinatura que casa com
   * `payment.subscription` — e `[]` quando o id da Asaas é desconhecido.
   */
  webhookScope?: { scope_tenant_id: string; scope_congregation_id: string }[];
  /** Plano do tenant do slug (doação pública). Default: Starter ativo. */
  tenantPlan?: { plan: 'starter' | 'premium'; status: 'active' | 'trial' | 'suspended' | 'cancelled' } | null;
  /** Cobranças dinâmicas públicas pendentes na última hora (teto por tenant). */
  pendingDynamicCount?: number;
  /** A gravação de `asaas_payment_id`/`qr_code` na linha falha (banco). */
  linkChargeFails?: boolean;
  /** Cobranças públicas abandonadas que o `prisma.system` devolve para a limpeza. */
  abandoned?: { id: string; asaas_payment_id: string }[];
  /** Status HTTP com que o `DELETE` na Asaas falha (404 = cobrança já não existe). */
  httpDeleteStatus?: number;
  /** Linhas que `pixPayment.findMany` devolve na lista de intenções da tesouraria. */
  intents?: Record<string, unknown>[];
  /** Total que `pixPayment.count` devolve para a mesma lista. */
  intentsTotal?: number;
};

function harness(opts: Opts = {}) {
  const cap = {
    subscriptionFindManyArgs: undefined as Record<string, unknown> | undefined,
    pixPayments: [] as Record<string, unknown>[],
    transactions: [] as Record<string, unknown>[],
    updates: [] as Record<string, unknown>[],
    audits: [] as Record<string, unknown>[],
    categoryQueries: [] as Record<string, unknown>[],
    posts: [] as { url: string; body: unknown }[],
    gets: [] as string[],
    receiptCalls: [] as string[],
    /** Escopo de RLS que o webhook repassa ao recibo (roda depois do commit, sem contexto). */
    receiptScopes: [] as unknown[],
    /** Doador declarado (doação pública) que o webhook repassa ao recibo. */
    receiptDonors: [] as unknown[],
    eventRegistrationUpdates: [] as Record<string, unknown>[],
    contexts: [] as unknown[][],
    pixSubscriptions: [] as Record<string, unknown>[],
    deletes: [] as string[],
    /** Argumentos de cada chamada a `pix_webhook_scope(paymentId, subscriptionId)`. */
    scopeQueries: [] as unknown[][],
    /** Quantos `set_config` já tinham rodado quando cada leitura de `pix_payments` aconteceu. */
    contextsAtRead: [] as number[],
    /** Argumentos de cada `pixPayment.findFirst` (filtros e `select`). */
    findFirstArgs: [] as Record<string, unknown>[],
    /** Chamadas a `pixPayment.count` (teto de cobranças públicas) e os filtros usados. */
    countWheres: [] as Record<string, unknown>[],
    /** Gravações de `asaas_payment_id`/`qr_code` na linha da doação pública. */
    chargeLinks: [] as Record<string, unknown>[],
    /** Argumentos de `pixPayment.findMany` / `count` da lista de intenções. */
    intentsFindMany: undefined as Record<string, unknown> | undefined,
    intentsCountWhere: undefined as Record<string, unknown> | undefined,
    /** Consulta da limpeza (`prisma.system.pixPayment.findMany`). */
    abandonedQuery: undefined as Record<string, unknown> | undefined,
    /** `updateMany` da limpeza que marca a linha `failed`. */
    closed: [] as Record<string, unknown>[],
    /** Ordem dos efeitos externos da limpeza: `delete:<url>` e `close:<id>`. */
    order: [] as string[],
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

  // Mesmo papel de `registro`, para `pix_subscriptions`: `cancelSubscription`
  // lê e escreve na mesma linha, e o webhook de PIX recorrente lê por
  // `asaas_subscription_id`.
  const assinatura: Record<string, unknown> | null =
    opts.pixSubscription === undefined
      ? {
          id: 'sub-1',
          tenant_id: 't1',
          congregation_id: 'c1',
          donor_person_id: 'donor-1',
          category_id: 'cat-oferta',
          amount: new Prisma.Decimal('50.00'),
          asaas_subscription_id: 'sub_asaas_1',
          status: 'active',
        }
      : opts.pixSubscription;

  // PIX recorrente (PROD-27): quando `registro` é `null` (nenhum PixPayment
  // pré-existente), é aqui que o `create` reativo do webhook grava — e onde o
  // `findFirst`/`updateMany` seguintes precisam achar a MESMA linha, senão a
  // idempotência do reenvio não tem o que testar. Simula também a unique
  // constraint de `asaas_payment_id`: segunda `create` com o mesmo id rejeita
  // como o Postgres rejeitaria.
  let novoPagamento: Record<string, unknown> | null = opts.raceOnReactiveCreate
    ? {
        id: 'pix-ganhou-a-corrida',
        tenant_id: 't1',
        congregation_id: 'c1',
        amount: new Prisma.Decimal('50.00'),
        category_id: 'cat-oferta',
        status: 'pending',
        donor_person_id: 'donor-1',
        scenario: 'recurring',
        asaas_payment_id: 'pay_recorrente_1',
        pix_subscription_id: 'sub-1',
      }
    : null;
  let reactiveFindFirstCalls = 0;

  const tx = {
    // O `set_config` que as rotas públicas fazem antes de ler a categoria.
    $executeRaw: (_strings: TemplateStringsArray, ...valores: unknown[]) => {
      cap.contexts.push(valores);
      return Promise.resolve(1);
    },
    financialTransaction: {
      create: (args: { data: Record<string, unknown> }) => {
        cap.transactions.push(args.data);
        return Promise.resolve({ id: 'tx-1' });
      },
    },
    eventRegistration: {
      updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        cap.eventRegistrationUpdates.push(args);
        return Promise.resolve({
          count: opts.eventRegistrationFinalizeCount ?? 1,
        });
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

        const alvo = registro ?? novoPagamento;
        // `status: { in: [...] }` é o `WHERE status IN (...)` do serviço (o
        // webhook também confirma uma linha `failed`); o resto é igualdade.
        const casa =
          alvo !== null &&
          Object.entries(args.where).every(([k, v]) =>
            v !== null && typeof v === 'object' && 'in' in v
              ? (v as { in: unknown[] }).in.includes(alvo[k])
              : alvo[k] === v,
          );

        if (!casa) return Promise.resolve({ count: 0 });

        Object.assign(alvo, args.data);
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
      tenantPlan: {
        findUnique: () =>
          Promise.resolve(
            opts.tenantPlan === undefined ? { plan: 'starter', status: 'active' } : opts.tenantPlan,
          ),
      },
      pixPayment: {
        create: (args: { data: Record<string, unknown> }) => {
          cap.pixPayments.push(args.data);
          return Promise.resolve({ id: 'pix-1', ...args.data });
        },
        // `count` serve a duas consultas: o teto de cobranças pendentes e o total
        // da lista de intenções — esta é a que filtra por congregação.
        count: (args: { where: Record<string, unknown> }) => {
          if ('congregation_id' in args.where) {
            cap.intentsCountWhere = args.where;
            return Promise.resolve(opts.intentsTotal ?? opts.intents?.length ?? 0);
          }
          cap.countWheres.push(args.where);
          return Promise.resolve(opts.pendingDynamicCount ?? 0);
        },
        findMany: (args: Record<string, unknown>) => {
          cap.intentsFindMany = args;
          return Promise.resolve(opts.intents ?? []);
        },
        updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          if (opts.linkChargeFails) return Promise.reject(new Error('banco fora do ar'));
          cap.chargeLinks.push(args);
          return Promise.resolve({ count: 1 });
        },
        // Reativo (PROD-27): `ON CONFLICT DO NOTHING` — o webhook roda dentro
        // de uma transação, onde um P2002 abortaria tudo. Só entra aqui
        // quando não havia `registro` (cenário 2/3 sempre pré-criam a linha
        // antes do webhook). Segunda inserção do mesmo `asaas_payment_id`
        // devolve `count: 0`, como o Postgres com `skipDuplicates`.
        createMany: (args: { data: Record<string, unknown>[]; skipDuplicates?: boolean }) => {
          const [dados] = args.data;
          if (opts.reactiveCreateThrowsUnknownError) {
            return Promise.reject(new Error('disco cheio'));
          }
          if (
            novoPagamento !== null &&
            novoPagamento['asaas_payment_id'] === dados['asaas_payment_id']
          ) {
            return Promise.resolve({ count: 0 });
          }
          novoPagamento = { id: 'pix-1', status: 'pending', ...dados };
          cap.pixPayments.push(dados);
          return Promise.resolve({ count: 1 });
        },
        findFirst: (args?: Record<string, unknown>) => {
          cap.findFirstArgs.push(args ?? {});
          cap.contextsAtRead.push(cap.contexts.length);
          if (registro === null) {
            // Corrida (raceOnReactiveCreate): a PRIMEIRA leitura ainda não
            // vê a linha que a "outra entrega" só grava entre esta chamada e
            // o `create` — só a partir da segunda (a recarga dentro do catch
            // de P2002) é que `novoPagamento` aparece.
            if (opts.raceOnReactiveCreate && reactiveFindFirstCalls === 0) {
              reactiveFindFirstCalls++;
              return Promise.resolve(null);
            }
            reactiveFindFirstCalls++;
            return Promise.resolve(novoPagamento ? { ...novoPagamento } : null);
          }
          const lido = { ...registro };
          if (opts.perdeCorrida) registro['status'] = 'confirmed';
          return Promise.resolve(lido);
        },
      },
      person: {
        findFirst: () =>
          Promise.resolve(opts.person === undefined ? { id: 'donor-1' } : opts.person),
      },
      pixSubscription: {
        create: (args: { data: Record<string, unknown> }) => {
          cap.pixSubscriptions.push(args.data);
          return Promise.resolve({ id: 'sub-1', ...args.data });
        },
        findMany: (args: Record<string, unknown>) => {
          cap.subscriptionFindManyArgs = args;
          return Promise.resolve(opts.pixSubscriptions ?? (assinatura ? [assinatura] : []));
        },
        findFirst: () => Promise.resolve(assinatura ? { ...assinatura } : null),
        findUnique: () => Promise.resolve(assinatura ? { ...assinatura } : null),
        update: (args: { data: Record<string, unknown> }) => {
          if (assinatura) Object.assign(assinatura, args.data);
          return Promise.resolve(assinatura ? { ...assinatura } : null);
        },
      },
    },
    // A auditoria não passa mais por `auditLog.create()` — `audit_logs` não
    // tem policy de INSERT para `app_user`. Vai por `audit_insert()`, via
    // `writeAuditLog`, e aqui em modo `bestEffort`, que usa o client BASE
    // (este `$executeRaw`, não o de `client`). Ver
    // `src/common/audit/write-audit-log.ts`.
    $executeRaw: (_strings: TemplateStringsArray, ...valores: unknown[]) => {
      if (opts.auditThrows) return Promise.reject(new Error('audit fora do ar'));
      const [tenant_id, congregation_id, actor_user_id, subject_person_id, entity, action, before, after] =
        valores as (string | null)[];
      // Omite o que veio nulo, para o registro capturado ter a mesma forma
      // que o `data:` do `auditLog.create()` tinha: quem não manda `after`
      // (uma exclusão, por exemplo) não deve aparecer com `after` presente.
      cap.audits.push({
        tenant_id,
        congregation_id,
        actor_user_id,
        ...(subject_person_id === null ? {} : { subject_person_id }),
        entity,
        action,
        ...(before === null ? {} : { before: JSON.parse(before) as unknown }),
        ...(after === null ? {} : { after: JSON.parse(after) as unknown }),
      });
      return Promise.resolve(1);
    },
    system: {
      pixPayment: {
        findMany: (args: Record<string, unknown>) => {
          cap.abandonedQuery = args;
          return Promise.resolve(opts.abandoned ?? []);
        },
        updateMany: (args: { where: { id: string } }) => {
          cap.closed.push(args as unknown as Record<string, unknown>);
          cap.order.push(`close:${args.where.id}`);
          return Promise.resolve({ count: 1 });
        },
      },
    },
    // `pix_webhook_scope()` (024): o webhook só conhece o id da Asaas.
    $queryRaw: (_strings: TemplateStringsArray, ...valores: unknown[]) => {
      cap.scopeQueries.push(valores);
      if (opts.webhookScope) return Promise.resolve(opts.webhookScope);
      const [, subscriptionId] = valores;
      const achou =
        registro !== null ||
        (typeof subscriptionId === 'string' &&
          assinatura !== null &&
          assinatura['asaas_subscription_id'] === subscriptionId);
      return Promise.resolve(
        achou ? [{ scope_tenant_id: 't1', scope_congregation_id: 'c1' }] : [],
      );
    },
    runInTx: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  } as unknown as PrismaService;

  const http = {
    get: (url: string) => {
      cap.gets.push(url);
      if (opts.httpFails) return throwError(() => new Error('asaas fora do ar'));
      if (opts.httpGetFailsFor && url.includes(opts.httpGetFailsFor)) {
        return throwError(() => new Error('qr indisponível'));
      }
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
            : url.includes('/subscriptions')
              ? { id: 'sub_asaas_novo' }
              : { id: 'pay_123', invoiceUrl: 'https://asaas.test/i/1' }),
      });
    },
    delete: (url: string) => {
      cap.deletes.push(url);
      cap.order.push(`delete:${url}`);
      if (opts.httpDeleteStatus) {
        return throwError(
          () =>
            new AxiosError('recusado', 'ERR_BAD_REQUEST', undefined, undefined, {
              status: opts.httpDeleteStatus,
            } as never),
        );
      }
      if (opts.httpDeleteFails) return throwError(() => new Error('asaas fora do ar'));
      return of({ data: opts.httpDelete?.(url) ?? {} });
    },
  } as unknown as HttpService;

  const donationReceiptService = {
    generateForTransaction: jest.fn((id: string, scope?: unknown, declared?: unknown) => {
      cap.receiptCalls.push(id);
      cap.receiptScopes.push(scope);
      cap.receiptDonors.push(declared);
      return opts.receiptRejects ? Promise.reject(new Error('recibo falhou')) : Promise.resolve(undefined);
    }),
  };

  return {
    service: new PixService(prisma, http, donationReceiptService as unknown as DonationReceiptService),
    cap,
    donationReceiptService,
    prisma: prisma as unknown as {
      client: { pixSubscription: { create: (args: unknown) => Promise<unknown> } };
    },
  };
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
      process.env['ASAAS_PAYMENTS_ENABLED'] = 'true';
    });

    it('com a trava de pagamentos desligada, responde 503 e não chama a Asaas', async () => {
      delete process.env['ASAAS_PAYMENTS_ENABLED'];
      const { service, cap } = harness();

      await expect(service.createDynamic(dto, user)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(cap.posts).toEqual([]);
      expect(cap.pixPayments).toEqual([]);
    });

    it('sem chave da Asaas configurada, responde 503 antes de tocar no banco', async () => {
      delete process.env['ASAAS_API_KEY'];
      const { service, cap } = harness();

      await expect(service.createDynamic(dto, user)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(cap.pixPayments).toEqual([]);
    });

    it('o customer da igreja é lembrado: a segunda cobrança não volta a consultar a Asaas por ele', async () => {
      // A doação pública chama isto sem login, a cada tentativa — cada GET
      // /customers é cota da Asaas gasta por um visitante.
      const { service, cap } = harness({ categories: [{ id: 'cat-1' }, { id: 'cat-2' }] });

      await service.createDynamic(dto, user);
      await service.createDynamic(dto, user);

      expect(cap.gets.filter((u) => u.includes('/customers'))).toHaveLength(1);
      expect(cap.posts.filter((p) => p.url.endsWith('/payments'))).toHaveLength(2);
    });

    it('o customer criado na primeira vez também é lembrado — sem segundo POST /customers', async () => {
      const { service, cap } = harness({
        categories: [{ id: 'cat-1' }, { id: 'cat-2' }],
        httpGet: (url) => (url.includes('/customers') ? { data: [] } : undefined),
      });

      await service.createDynamic(dto, user);
      await service.createDynamic(dto, user);

      expect(cap.posts.filter((p) => p.url.endsWith('/customers'))).toHaveLength(1);
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

  describe('createForEventRegistration (PROD-24)', () => {
    beforeEach(() => {
      process.env['ASAAS_API_KEY'] = 'chave-asaas';
      process.env['ASAAS_API_URL'] = 'https://asaas.test/v3';
      process.env['ASAAS_PAYMENTS_ENABLED'] = 'true';
    });

    it('com a trava de pagamentos desligada, responde 503 e não chama a Asaas', async () => {
      delete process.env['ASAAS_PAYMENTS_ENABLED'];
      const { service, cap } = harness();

      await expect(
        service.createForEventRegistration('t1', 'c1', 30, 'Inscrição — Retiro'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(cap.posts).toEqual([]);
    });

    it('devolve o QR e grava o pagamento no cenário `event_registration`', async () => {
      const { service, cap } = harness();

      const result = await service.createForEventRegistration('t1', 'g1', 50, 'Inscrição — Acampamento');

      expect(result).toMatchObject({ payment_id: 'pix-1', amount: 50 });
      expect(cap.pixPayments[0]).toMatchObject({
        scenario: 'event_registration',
        status: 'pending',
        asaas_payment_id: 'pay_123',
      });
    });

    it('sem chave da Asaas, 503 antes de tocar no banco', async () => {
      delete process.env['ASAAS_API_KEY'];
      const { service, cap } = harness();

      await expect(
        service.createForEventRegistration('t1', 'g1', 50, 'Inscrição'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(cap.pixPayments).toEqual([]);
    });

    it('busca a categoria por "inscri", caindo para "Oferta" se não achar', async () => {
      const { service, cap } = harness();

      await service.createForEventRegistration('t1', 'g1', 50, 'Inscrição');

      expect(cap.categoryQueries[0]?.['name']).toEqual({ contains: 'inscri', mode: 'insensitive' });
    });

    it('igreja sem chave PIX vira 400', async () => {
      const { service } = harness({ branding: null });

      await expect(
        service.createForEventRegistration('t1', 'g1', 50, 'Inscrição'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('Asaas fora do ar vira 503 e não grava pagamento órfão', async () => {
      const { service, cap } = harness({ httpFails: true });

      await expect(
        service.createForEventRegistration('t1', 'g1', 50, 'Inscrição'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(cap.pixPayments).toEqual([]);
    });

    it('sem `app_name` no branding, cai para o nome do tenant', async () => {
      const { service, cap } = harness({
        branding: { pix_key: 'k', app_name: null },
        httpGet: (url) =>
          url.includes('/customers')
            ? { data: [] }
            : { encodedImage: '', payload: '', expirationDate: '' },
      });

      await service.createForEventRegistration('t1', 'g1', 50, 'Inscrição');

      expect((cap.posts[0]?.body as { name: string }).name).toBe('Igreja Central');
    });

    it('tenant sem nome no banco vira string vazia, não `undefined`', async () => {
      const { service, cap } = harness({
        branding: { pix_key: 'k', app_name: null },
        tenant: null,
        httpGet: (url) =>
          url.includes('/customers')
            ? { data: [] }
            : { encodedImage: '', payload: '', expirationDate: '' },
      });

      await service.createForEventRegistration('t1', 'g1', 50, 'Inscrição');

      expect((cap.posts[0]?.body as { name: string }).name).toBe('');
    });
  });

  describe('createSubscription (PIX recorrente, PROD-27)', () => {
    const dto = { donor_person_id: 'donor-1', amount: 100 };

    beforeEach(() => {
      process.env['ASAAS_API_KEY'] = 'chave-asaas';
      process.env['ASAAS_API_URL'] = 'https://asaas.test/v3';
      process.env['ASAAS_PAYMENTS_ENABLED'] = 'true';
    });

    it('sem chave da Asaas configurada, responde 503 antes de tocar no banco', async () => {
      delete process.env['ASAAS_API_KEY'];
      const { service, cap } = harness();

      await expect(service.createSubscription(dto, user)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(cap.pixSubscriptions).toEqual([]);
    });

    it('com a trava de pagamentos desligada, responde 503 sem chamar a Asaas — mesmo com chave configurada', async () => {
      delete process.env['ASAAS_PAYMENTS_ENABLED'];
      const { service, cap } = harness();

      await expect(service.createSubscription(dto, user)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(cap.posts).toEqual([]);
      expect(cap.pixSubscriptions).toEqual([]);
    });

    it('gravação que falha depois da Asaas desfaz a assinatura lá (não deixa cobrança órfã)', async () => {
      const { service, cap, prisma } = harness();
      prisma.client.pixSubscription.create = () => Promise.reject(new Error('banco caiu'));

      await expect(service.createSubscription(dto, user)).rejects.toThrow('banco caiu');
      expect(cap.deletes).toEqual(['https://asaas.test/v3/subscriptions/sub_asaas_novo']);
    });

    it('gravação falha E o desfazer na Asaas também falha: loga a órfã com o id e propaga o erro original', async () => {
      const { service, cap, prisma } = harness({ httpDeleteFails: true });
      prisma.client.pixSubscription.create = () => Promise.reject(new Error('banco caiu'));
      const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await expect(service.createSubscription(dto, user)).rejects.toThrow('banco caiu');

      expect(cap.deletes).toEqual(['https://asaas.test/v3/subscriptions/sub_asaas_novo']);
      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining('sub_asaas_novo'),
        expect.any(Error),
      );
    });

    it('unique "uma ativa contratada pelo doador" vira 409 e desfaz a assinatura aberta na Asaas', async () => {
      const { service, cap, prisma } = harness();
      prisma.client.pixSubscription.create = () =>
        Promise.reject(
          new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: 'test',
          }),
        );

      await expect(service.createSubscription(dto, user)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(cap.deletes).toEqual(['https://asaas.test/v3/subscriptions/sub_asaas_novo']);
    });

    it('grava a versão e a hora do aceite quando quem cria é o próprio doador', async () => {
      const { service, cap } = harness();

      await service.createSubscriptionFor(
        { donorPersonId: 'donor-1', amount: 80, consentVersion: 'dizimo-automatico-v1' },
        user,
      );

      expect(cap.pixSubscriptions[0]).toMatchObject({ consent_version: 'dizimo-automatico-v1' });
      expect(cap.pixSubscriptions[0]['consent_accepted_at']).toBeInstanceOf(Date);
    });

    it('criada pelo tesoureiro, não grava aceite nenhum', async () => {
      const { service, cap } = harness();

      await service.createSubscription(dto, user);

      expect(cap.pixSubscriptions[0]).not.toHaveProperty('consent_version');
    });

    it('igreja sem chave PIX configurada vira 400', async () => {
      const { service } = harness({ branding: { pix_key: null, app_name: 'App' } });

      await expect(service.createSubscription(dto, user)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('doador inexistente no tenant vira 404 — não cria assinatura na Asaas', async () => {
      const { service, cap } = harness({ person: null });

      await expect(service.createSubscription(dto, user)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(cap.posts).toEqual([]);
      expect(cap.pixSubscriptions).toEqual([]);
    });

    it('cria a assinatura na Asaas com ciclo mensal e grava a linha ativa', async () => {
      const { service, cap } = harness();

      const result = await service.createSubscription(dto, user);

      const body = cap.posts.find((p) => p.url.endsWith('/subscriptions'))?.body as Record<
        string,
        unknown
      >;
      expect(body).toMatchObject({ billingType: 'PIX', cycle: 'MONTHLY', value: 100 });
      expect(String(body['externalReference'])).toMatch(/^ORB-SUB-[0-9A-Z]{6}$/);

      expect(cap.pixSubscriptions[0]).toMatchObject({
        tenant_id: 't1',
        congregation_id: 'c1',
        donor_person_id: 'donor-1',
        category_id: 'cat-oferta',
        asaas_subscription_id: 'sub_asaas_novo',
        status: 'active',
        created_by_user_id: 'user-1',
      });
      expect(result).toMatchObject({ id: 'sub-1', asaas_subscription_id: 'sub_asaas_novo' });
    });

    it('a assinatura pertence à congregação da sessão, não à "primeira do tenant"', async () => {
      const { service, cap } = harness();

      await service.createSubscription(dto, { ...user, congregation_id: 'cong-outra' });

      expect(cap.pixSubscriptions[0]).toMatchObject({ congregation_id: 'cong-outra' });
    });

    it('sem `app_name` no branding, o nome do customer cai para o nome do tenant', async () => {
      const { service, cap } = harness({
        branding: { pix_key: 'k', app_name: null },
        httpGet: (url) => (url.includes('/customers') ? { data: [] } : {}),
      });

      await service.createSubscription(dto, user);

      const customerBody = cap.posts.find((p) => p.url.endsWith('/customers'))?.body as
        | { name: string }
        | undefined;
      expect(customerBody?.name).toBe('Igreja Central');
    });

    it('sem `app_name` e sem nome de tenant no banco, cai para string vazia', async () => {
      const { service, cap } = harness({
        branding: { pix_key: 'k', app_name: null },
        tenant: null,
        httpGet: (url) => (url.includes('/customers') ? { data: [] } : {}),
      });

      await service.createSubscription(dto, user);

      const customerBody = cap.posts.find((p) => p.url.endsWith('/customers'))?.body as
        | { name: string }
        | undefined;
      expect(customerBody?.name).toBe('');
    });

    it('Asaas fora do ar vira 503 e não grava assinatura órfã', async () => {
      const { service, cap } = harness({ httpFails: true });

      await expect(service.createSubscription(dto, user)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(cap.pixSubscriptions).toEqual([]);
    });
  });

  describe('listSubscriptions', () => {
    it('lista as assinaturas da mesma tenant+congregação da sessão', async () => {
      const rows = [{ id: 'sub-1' }, { id: 'sub-2' }];
      const { service } = harness({ pixSubscriptions: rows });

      const result = await service.listSubscriptions(user);

      expect(result).toEqual(rows);
    });

    it('pede o nome do doador junto, para o painel não listar só UUIDs', async () => {
      const { service, cap } = harness({ pixSubscriptions: [] });

      await service.listSubscriptions(user);

      expect(cap.subscriptionFindManyArgs).toMatchObject({
        include: { donorPerson: { select: { full_name: true } } },
      });
    });
  });

  describe('cancelSubscription', () => {
    beforeEach(() => {
      process.env['ASAAS_API_KEY'] = 'chave-asaas';
      process.env['ASAAS_API_URL'] = 'https://asaas.test/v3';
      process.env['ASAAS_PAYMENTS_ENABLED'] = 'true';
    });

    it('assinatura inexistente (ou de outro tenant/congregação) vira 404', async () => {
      const { service } = harness({ pixSubscription: null });

      await expect(service.cancelSubscription('sub-x', user)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('cancela na Asaas e marca a linha como cancelled, com `cancelled_at`', async () => {
      const { service, cap } = harness();

      const result = await service.cancelSubscription('sub-1', user);

      expect(cap.deletes).toEqual(['https://asaas.test/v3/subscriptions/sub_asaas_1']);
      expect(result).toMatchObject({ status: 'cancelled' });
      expect((result as { cancelled_at?: Date }).cancelled_at).toBeInstanceOf(Date);
    });

    it('já cancelada: não chama a Asaas de novo, devolve a linha como está', async () => {
      const { service, cap } = harness({
        pixSubscription: { id: 'sub-1', tenant_id: 't1', congregation_id: 'c1', status: 'cancelled' },
      });

      const result = await service.cancelSubscription('sub-1', user);

      expect(cap.deletes).toEqual([]);
      expect(result).toMatchObject({ status: 'cancelled' });
    });

    it('Asaas fora do ar vira 503 e não marca a linha como cancelada', async () => {
      const { service, cap } = harness({ httpDeleteFails: true });

      await expect(service.cancelSubscription('sub-1', user)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(cap.deletes).toHaveLength(1);
    });

    it('Asaas responde 404 (já não existe lá): marca cancelada, em vez de 503 para sempre', async () => {
      const { service } = harness({ httpDeleteStatus: 404 });

      const result = await service.cancelSubscription('sub-1', user);

      expect(result).toMatchObject({ status: 'cancelled' });
    });

    it('Asaas responde outro erro HTTP (500): 503, e a linha segue ativa', async () => {
      const { service } = harness({ httpDeleteStatus: 500 });

      await expect(service.cancelSubscription('sub-1', user)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      await expect(service.listSubscriptions(user)).resolves.toEqual([
        expect.objectContaining({ status: 'active' }),
      ]);
    });

    it('com a trava de pagamentos desligada, cancelar continua funcionando', async () => {
      delete process.env['ASAAS_PAYMENTS_ENABLED'];
      const { service, cap } = harness();

      const result = await service.cancelSubscription('sub-1', user);

      expect(cap.deletes).toEqual(['https://asaas.test/v3/subscriptions/sub_asaas_1']);
      expect(result).toMatchObject({ status: 'cancelled' });
    });
  });

  describe('createPublicDonation', () => {
    it('grava só a intenção em `pix_payments`, no cenário `public` — nenhum lançamento', async () => {
      // DRE e dashboard somam `financial_transactions` sem olhar status: um
      // lançamento aqui deixaria qualquer visitante inflar a receita da igreja.
      const { service, cap } = harness();

      const result = await service.createPublicDonation(manualDto);

      expect(cap.transactions).toEqual([]);
      expect(cap.pixPayments).toHaveLength(1);
      expect(cap.pixPayments[0]).toMatchObject({
        tenant_id: 't1',
        congregation_id: 'c1',
        scenario: 'public',
        status: 'pending',
        category_id: 'cat-oferta',
        pix_key: 'chave@igreja.test',
      });
      expect(result.pix_key).toBe('chave@igreja.test');
    });

    it('a referência do retorno são os 8 primeiros dígitos do id do pagamento', async () => {
      const { service, cap } = harness();

      const result = await service.createPublicDonation(manualDto);

      const id = String(cap.pixPayments[0]?.['id']);
      expect(result.transaction_ref).toBe(`PIX-${id.slice(0, 8).toUpperCase()}`);
      expect(result.transaction_ref).toMatch(/^PIX-[0-9A-F]{8}$/);
    });

    it('fixa tenant e congregação resolvidos pelo slug antes de ler a categoria', async () => {
      // Sem JWT não há contexto, e `financial_categories` fica invisível:
      // era o "Categoria de receita não encontrada" de toda igreja.
      const { service, cap } = harness();

      await service.createPublicDonation(manualDto);

      expect(cap.contexts).toEqual([['t1', 'c1']]);
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

    describe('QR dinâmico — igreja Premium (DPUB-01…05, 08, 10, 13, 14)', () => {
      const premium = { plan: 'premium', status: 'active' } as const;

      beforeEach(() => {
        process.env['ASAAS_API_KEY'] = 'chave-asaas';
        process.env['ASAAS_API_URL'] = 'https://asaas.test/v3';
        process.env['ASAAS_PAYMENTS_ENABLED'] = 'true';
      });

      it('com a trava de pagamentos desligada, Premium recebe a chave estática como o Starter — sem motivo de fallback e sem chamar a Asaas', async () => {
        delete process.env['ASAAS_PAYMENTS_ENABLED'];
        const { service, cap } = harness({ tenantPlan: premium });

        const result = await service.createPublicDonation(manualDto);

        expect(result).toMatchObject({ mode: 'static', pix_key: 'chave@igreja.test' });
        expect(result).not.toHaveProperty('fallback_reason');
        expect(cap.posts).toEqual([]);
        // A intenção continua gravada, para a baixa manual da tesouraria.
        expect(cap.pixPayments).toHaveLength(1);
      });

      it('cria a cobrança na Asaas e devolve o QR, o copia-e-cola, o payment_id e a validade de 24h', async () => {
        const { service, cap } = harness({ tenantPlan: premium });
        const antes = Date.now();

        const result = await service.createPublicDonation(manualDto);

        const id = String(cap.pixPayments[0]?.['id']);
        expect(result).toMatchObject({
          mode: 'dynamic',
          pix_key: 'chave@igreja.test',
          amount: 50,
          church_name: 'App da Igreja',
          transaction_ref: `PIX-${id.slice(0, 8).toUpperCase()}`,
          payment_id: id,
          qr_code: '00020126...br.gov.bcb.pix',
          qr_code_image: 'iVBORw0KG',
        });
        const expiraEm = new Date((result as { expires_at: string }).expires_at).getTime();
        expect(expiraEm).toBeGreaterThanOrEqual(antes + 24 * 60 * 60 * 1000);
        expect(expiraEm).toBeLessThanOrEqual(Date.now() + 24 * 60 * 60 * 1000);
        expect(result).not.toHaveProperty('fallback_reason');
      });

      it('a cobrança leva o valor, PIX, o id da linha como referência externa e descrição sem dado do doador', async () => {
        const { service, cap } = harness({ tenantPlan: premium });

        await service.createPublicDonation({
          ...manualDto,
          amount: 80.5,
          donor_name: 'Fulano de Tal',
          donor_email: 'fulano@teste.com',
          donor_consent: true,
        });

        const cobranca = cap.posts.find((p) => p.url.endsWith('/payments'));
        const id = String(cap.pixPayments[0]?.['id']);
        expect(cobranca?.body).toMatchObject({
          customer: 'cus_1',
          billingType: 'PIX',
          value: 80.5,
          description: 'Doação via Orbien',
          externalReference: id,
        });
        // Minimização: nome e e-mail do doador não vão para a Asaas.
        expect(JSON.stringify(cap.posts)).not.toContain('Fulano');
        expect(JSON.stringify(cap.posts)).not.toContain('fulano@teste.com');
      });

      it('grava a linha ANTES de falar com a Asaas — se o processo cair depois da cobrança, o webhook ainda a acha', async () => {
        let linhasQuandoACobrancaFoiCriada = -1;
        const { service, cap } = harness({
          tenantPlan: premium,
          httpPost: (url) => {
            if (url.endsWith('/payments')) linhasQuandoACobrancaFoiCriada = cap.pixPayments.length;
            return undefined;
          },
        });

        await service.createPublicDonation(manualDto);

        expect(linhasQuandoACobrancaFoiCriada).toBe(1);
      });

      it('amarra o id da Asaas e o QR à linha, sob o contexto da igreja', async () => {
        const { service, cap } = harness({ tenantPlan: premium });

        await service.createPublicDonation(manualDto);

        const id = String(cap.pixPayments[0]?.['id']);
        expect(cap.chargeLinks).toEqual([
          {
            where: { id },
            data: { asaas_payment_id: 'pay_123', qr_code: '00020126...br.gov.bcb.pix' },
          },
        ]);
        expect(cap.contexts).toEqual([
          ['t1', 'c1'],
          ['t1', 'c1'],
        ]);
      });

      it('a linha nasce no cenário `public`, pendente, e nenhum lançamento é criado (DPUB-08)', async () => {
        const { service, cap } = harness({ tenantPlan: premium });

        await service.createPublicDonation(manualDto);

        expect(cap.pixPayments[0]).toMatchObject({
          scenario: 'public',
          status: 'pending',
          category_id: 'cat-oferta',
          pix_key: 'chave@igreja.test',
        });
        expect(cap.transactions).toEqual([]);
      });

      it('plano em período de teste (`trial`) também recebe o QR', async () => {
        const { service } = harness({ tenantPlan: { plan: 'premium', status: 'trial' } });

        const result = await service.createPublicDonation(manualDto);

        expect(result).toMatchObject({ mode: 'dynamic' });
      });

      it.each(['suspended', 'cancelled'] as const)(
        'Premium %s não gera cobrança nova: chave estática, Asaas intocada',
        async (status) => {
          const { service, cap } = harness({ tenantPlan: { plan: 'premium', status } });

          const result = await service.createPublicDonation(manualDto);

          expect(result).toMatchObject({ mode: 'static', pix_key: 'chave@igreja.test' });
          expect(result).not.toHaveProperty('fallback_reason');
          expect(cap.gets).toEqual([]);
          expect(cap.posts).toEqual([]);
        },
      );

      it('Starter: chave estática, sem fallback_reason, Asaas e teto intocados (DPUB-02)', async () => {
        const { service, cap } = harness({ tenantPlan: { plan: 'starter', status: 'active' } });

        const result = await service.createPublicDonation(manualDto);

        expect(result).toMatchObject({ mode: 'static', pix_key: 'chave@igreja.test', amount: 50 });
        expect(result).not.toHaveProperty('fallback_reason');
        expect(result).not.toHaveProperty('payment_id');
        expect(cap.gets).toEqual([]);
        expect(cap.posts).toEqual([]);
        expect(cap.countWheres).toEqual([]);
        expect(cap.pixPayments).toHaveLength(1);
      });

      it('tenant sem registro de plano é tratado como Starter', async () => {
        const { service, cap } = harness({ tenantPlan: null });

        const result = await service.createPublicDonation(manualDto);

        expect(result).toMatchObject({ mode: 'static' });
        expect(cap.posts).toEqual([]);
      });

      it('sem ASAAS_API_KEY no ambiente, cai para a chave estática com o motivo e sem chamar a Asaas', async () => {
        delete process.env['ASAAS_API_KEY'];
        const { service, cap } = harness({ tenantPlan: premium });

        const result = await service.createPublicDonation(manualDto);

        expect(result).toMatchObject({ mode: 'static', fallback_reason: 'provider_unavailable' });
        expect(cap.gets).toEqual([]);
        expect(cap.posts).toEqual([]);
        expect(cap.pixPayments).toHaveLength(1);
      });

      it('Asaas fora do ar: chave estática com o motivo, a intenção fica gravada, sem lançamento', async () => {
        const { service, cap } = harness({ tenantPlan: premium, httpFails: true });

        const result = await service.createPublicDonation(manualDto);

        expect(result).toMatchObject({
          mode: 'static',
          pix_key: 'chave@igreja.test',
          fallback_reason: 'provider_unavailable',
        });
        expect(result).not.toHaveProperty('qr_code');
        expect(cap.pixPayments).toHaveLength(1);
        expect(cap.chargeLinks).toEqual([]);
        expect(cap.transactions).toEqual([]);
        // A cobrança nem chegou a existir: não há o que cancelar.
        expect(cap.deletes).toEqual([]);
      });

      it('cobrança criada mas QR indisponível: cancela a cobrança na Asaas e cai para a chave estática', async () => {
        const { service, cap } = harness({ tenantPlan: premium, httpGetFailsFor: 'pixQrCode' });

        const result = await service.createPublicDonation(manualDto);

        expect(result).toMatchObject({ mode: 'static', fallback_reason: 'provider_unavailable' });
        expect(cap.deletes).toEqual(['https://asaas.test/v3/payments/pay_123']);
        expect(cap.chargeLinks).toEqual([]);
      });

      it('cobrança criada mas a linha não pôde ser atualizada: cancela a cobrança e cai para a chave estática', async () => {
        const { service, cap } = harness({ tenantPlan: premium, linkChargeFails: true });

        const result = await service.createPublicDonation(manualDto);

        expect(result).toMatchObject({ mode: 'static', fallback_reason: 'provider_unavailable' });
        expect(cap.deletes).toEqual(['https://asaas.test/v3/payments/pay_123']);
      });

      it('se nem o cancelamento da cobrança órfã der certo, o doador ainda recebe a chave estática', async () => {
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        const { service } = harness({
          tenantPlan: premium,
          httpGetFailsFor: 'pixQrCode',
          httpDeleteFails: true,
        });

        const result = await service.createPublicDonation(manualDto);

        expect(result).toMatchObject({ mode: 'static', fallback_reason: 'provider_unavailable' });
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('pay_123'));
      });

      it('teto de cobranças pendentes na última hora: acima dele, chave estática com o motivo e Asaas intocada', async () => {
        const { service, cap } = harness({ tenantPlan: premium, pendingDynamicCount: 60 });

        const result = await service.createPublicDonation(manualDto);

        expect(result).toMatchObject({ mode: 'static', fallback_reason: 'cap_reached' });
        expect(cap.posts).toEqual([]);
        expect(cap.pixPayments).toHaveLength(1);
      });

      it('um abaixo do teto ainda cobra', async () => {
        const { service } = harness({ tenantPlan: premium, pendingDynamicCount: 59 });

        expect(await service.createPublicDonation(manualDto)).toMatchObject({ mode: 'dynamic' });
      });

      it('o teto conta só pendentes públicas com cobrança, deste tenant, da última hora', async () => {
        const { service, cap } = harness({ tenantPlan: premium });
        const antes = Date.now();

        await service.createPublicDonation(manualDto);

        const where = cap.countWheres[0] as {
          tenant_id: string;
          scenario: string;
          status: string;
          asaas_payment_id: unknown;
          created_at: { gte: Date };
        };
        expect(where).toMatchObject({
          tenant_id: 't1',
          scenario: 'public',
          status: 'pending',
          asaas_payment_id: { not: null },
        });
        expect(where.created_at.gte.getTime()).toBeGreaterThanOrEqual(antes - 60 * 60 * 1000 - 1);
        expect(where.created_at.gte.getTime()).toBeLessThanOrEqual(Date.now() - 60 * 60 * 1000 + 1);
      });

      it('o plano nunca vem do corpo: um `plan` forjado no DTO não abre cobrança para o Starter', async () => {
        const { service, cap } = harness({ tenantPlan: { plan: 'starter', status: 'active' } });
        const forjado = { ...manualDto, plan: 'premium', mode: 'dynamic' } as unknown as typeof manualDto;

        const result = await service.createPublicDonation(forjado);

        expect(result).toMatchObject({ mode: 'static' });
        expect(cap.posts).toEqual([]);
      });

      it('honeypot: nem consulta plano nem fala com a Asaas', async () => {
        const { service, cap } = harness({ tenantPlan: premium });

        const result = await service.createPublicDonation({ ...manualDto, website: 'http://spam' });

        expect(result).toEqual({ pix_key: '', amount: 50, church_name: '', transaction_ref: '' });
        expect(cap.posts).toEqual([]);
        expect(cap.pixPayments).toEqual([]);
      });
    });

    describe('dados declarados pelo doador (DPUB-22, DPUB-23)', () => {
      it('nome e e-mail ficam na linha, normalizados, com a versão do termo e o instante do aceite', async () => {
        const { service, cap } = harness();
        const antes = Date.now();

        await service.createPublicDonation({
          ...manualDto,
          donor_name: '  Ana Silva  ',
          donor_email: '  Ana@Igreja.COM ',
          donor_consent: true,
        });

        expect(cap.pixPayments[0]).toMatchObject({
          donor_name: 'Ana Silva',
          donor_email: 'ana@igreja.com',
          donor_consent_version: 'donor_consent_v1',
        });
        const quando = (cap.pixPayments[0]?.['donor_consented_at'] as Date).getTime();
        expect(quando).toBeGreaterThanOrEqual(antes);
        expect(quando).toBeLessThanOrEqual(Date.now());
      });

      it('só o nome: grava o nome, sem e-mail e sem aceite (não há o que consentir)', async () => {
        const { service, cap } = harness();

        await service.createPublicDonation({ ...manualDto, donor_name: 'Ana' });

        expect(cap.pixPayments[0]).toMatchObject({
          donor_name: 'Ana',
          donor_email: null,
          donor_consent_version: null,
          donor_consented_at: null,
        });
      });

      it('anônimo: tudo nulo', async () => {
        const { service, cap } = harness();

        await service.createPublicDonation(manualDto);

        expect(cap.pixPayments[0]).toMatchObject({
          donor_name: null,
          donor_email: null,
          donor_consent_version: null,
          donor_consented_at: null,
        });
      });

      it('nome e e-mail só com espaços contam como não informados', async () => {
        const { service, cap } = harness();

        await service.createPublicDonation({ ...manualDto, donor_name: '   ', donor_email: '  ' });

        expect(cap.pixPayments[0]).toMatchObject({ donor_name: null, donor_email: null });
      });

      it('e-mail sem aceite é recusado e nada é gravado (guarda do service, além do DTO)', async () => {
        const { service, cap } = harness();

        await expect(
          service.createPublicDonation({ ...manualDto, donor_email: 'ana@igreja.com' }),
        ).rejects.toThrow('Aceite o uso do e-mail para receber o recibo');
        await expect(
          service.createPublicDonation({ ...manualDto, donor_email: 'ana@igreja.com', donor_consent: false }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(cap.pixPayments).toEqual([]);
      });

      it('a resposta não devolve nome nem e-mail', async () => {
        const { service } = harness();

        const result = await service.createPublicDonation({
          ...manualDto,
          donor_name: 'Ana',
          donor_email: 'ana@igreja.com',
          donor_consent: true,
        });

        expect(JSON.stringify(result)).not.toContain('Ana');
        expect(JSON.stringify(result)).not.toContain('ana@igreja.com');
      });
    });

    it('sem `app_name` no branding, o nome da igreja cai para o nome do tenant', async () => {
      const { service } = harness({ branding: { pix_key: 'chave@igreja.test', app_name: null } });

      const result = await service.createPublicDonation(manualDto);

      expect(result).toMatchObject({ church_name: 'Igreja Central' });
    });

    describe('slug sem resposta distinguível (DPUB-14)', () => {
      it.each([
        ['slug inexistente', { tenant: null }],
        ['igreja sem branding', { branding: null }],
        ['branding sem chave PIX', { branding: { pix_key: null, app_name: 'X' } }],
        ['tenant sem congregação', { congregation: null }],
      ] as const)('%s: o MESMO 404, sem revelar o estado da configuração', async (_nome, opts) => {
        const { service, cap } = harness(opts);

        const erro = await service.createPublicDonation(manualDto).catch((e: unknown) => e);

        expect(erro).toBeInstanceOf(NotFoundException);
        expect((erro as NotFoundException).message).toBe('Igreja não encontrada');
        expect(cap.pixPayments).toEqual([]);
      });
    });

    it('sem categoria de receita, vira 400 e não grava nada', async () => {
      const { service, cap } = harness({ categories: [] });

      await expect(service.createPublicDonation(manualDto)).rejects.toThrow(
        'Categoria de receita não encontrada',
      );
      expect(cap.pixPayments).toEqual([]);
    });
  });

  describe('getPublicDonationStatus (DPUB-15, 16, 19, 20)', () => {
    const ID = '8c9f9a52-3b2e-4a40-9d63-6c6a2f0a1b11';
    const HORA = 60 * 60 * 1000;
    const linha = (status: string, idadeMs: number) => ({
      id: ID,
      status,
      created_at: new Date(Date.now() - idadeMs),
    });

    it('pendente e recente: `pending`, com a validade de 24h contada da criação', async () => {
      const criada = new Date(Date.now() - 2 * HORA);
      const { service } = harness({ pixPayment: { id: ID, status: 'pending', created_at: criada } });

      const result = await service.getPublicDonationStatus('igreja-central', ID);

      expect(result).toEqual({
        status: 'pending',
        expires_at: new Date(criada.getTime() + 24 * HORA).toISOString(),
      });
    });

    it('confirmada: `confirmed`', async () => {
      const { service } = harness({ pixPayment: linha('confirmed', HORA) });

      expect((await service.getPublicDonationStatus('igreja-central', ID)).status).toBe('confirmed');
    });

    it('confirmada há mais de 24h continua `confirmed` — pago não "expira"', async () => {
      const { service } = harness({ pixPayment: linha('confirmed', 30 * HORA) });

      expect((await service.getPublicDonationStatus('igreja-central', ID)).status).toBe('confirmed');
    });

    it('pendente há mais de 24h: `expired`, sem gravar nada (expiração é lida, não escrita)', async () => {
      const { service, cap } = harness({ pixPayment: linha('pending', 25 * HORA) });

      expect((await service.getPublicDonationStatus('igreja-central', ID)).status).toBe('expired');
      expect(cap.updates).toEqual([]);
      expect(cap.transactions).toEqual([]);
    });

    it('`failed` (marcada pela limpeza): `expired`', async () => {
      const { service } = harness({ pixPayment: linha('failed', HORA) });

      expect((await service.getPublicDonationStatus('igreja-central', ID)).status).toBe('expired');
    });

    it('devolve só `status` e `expires_at` — nada de valor, chave, nome, e-mail ou id de tenant', async () => {
      const { service } = harness({
        pixPayment: {
          ...linha('pending', HORA),
          amount: new Prisma.Decimal('50.00'),
          pix_key: 'chave@igreja.test',
          tenant_id: 't1',
          donor_email: 'a@b.com',
        },
      });

      const result = await service.getPublicDonationStatus('igreja-central', ID);

      expect(Object.keys(result).sort()).toEqual(['expires_at', 'status']);
    });

    it('lê sob o contexto do slug e filtra por id, tenant e cenário `public` — pede só status e criação', async () => {
      const { service, cap } = harness({ pixPayment: linha('pending', HORA) });

      await service.getPublicDonationStatus('igreja-central', ID);

      expect(cap.contexts).toEqual([['t1', 'c1']]);
      expect(cap.contextsAtRead).toEqual([1]);
      expect(cap.findFirstArgs[0]).toEqual({
        where: { id: ID, tenant_id: 't1', scenario: 'public' },
        select: { status: true, created_at: true },
      });
    });

    it('id que a RLS não deixa ver (outra igreja) e id inexistente: o MESMO 404', async () => {
      const { service } = harness({ pixPayment: null, pixSubscription: null });

      const erro = await service.getPublicDonationStatus('igreja-central', ID).catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(NotFoundException);
      expect((erro as NotFoundException).message).toBe('Doação não encontrada');
    });

    it.each([
      ['slug inexistente', { tenant: null }],
      ['igreja sem chave PIX', { branding: { pix_key: null, app_name: null } }],
    ] as const)('%s: o mesmo 404 do id desconhecido', async (_nome, opts) => {
      const { service, cap } = harness(opts);

      const erro = await service.getPublicDonationStatus('qualquer', ID).catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(NotFoundException);
      expect((erro as NotFoundException).message).toBe('Doação não encontrada');
      expect(cap.findFirstArgs).toEqual([]);
    });

    it('erro que não é 404 ao resolver a igreja não é mascarado como 404', async () => {
      const { service } = harness();
      (service as unknown as { prisma: { client: { tenant: { findUnique: () => Promise<never> } } } }).prisma.client.tenant.findUnique =
        () => Promise.reject(new Error('banco fora do ar'));

      await expect(service.getPublicDonationStatus('igreja-central', ID)).rejects.toThrow(
        'banco fora do ar',
      );
    });
  });

  describe('expireAbandonedPublicDonations (DPUB-27, DPUB-09)', () => {
    const abandoned = [
      { id: 'pix-a', asaas_payment_id: 'pay_a' },
      { id: 'pix-b', asaas_payment_id: 'pay_b' },
    ];

    beforeEach(() => {
      process.env['ASAAS_API_KEY'] = 'chave-asaas';
      process.env['ASAAS_API_URL'] = 'https://asaas.test/v3';
    });

    it('cancela cada cobrança na Asaas e SÓ DEPOIS marca a linha `failed` — a ordem evita perder dinheiro', async () => {
      const { service, cap } = harness({ abandoned });

      const result = await service.expireAbandonedPublicDonations();

      expect(result).toEqual({ cancelled: 2, kept: 0 });
      expect(cap.order).toEqual([
        'delete:https://asaas.test/v3/payments/pay_a',
        'close:pix-a',
        'delete:https://asaas.test/v3/payments/pay_b',
        'close:pix-b',
      ]);
      expect(cap.closed[0]).toEqual({
        where: { id: 'pix-a', status: 'pending' },
        data: { status: 'failed' },
      });
    });

    it('só pega pendentes públicas COM cobrança, com mais de 48h, em lote limitado, das mais antigas', async () => {
      const { service, cap } = harness();
      const antes = Date.now();

      await service.expireAbandonedPublicDonations();
      const depois = Date.now();

      const where = cap.abandonedQuery?.['where'] as {
        scenario: string;
        status: string;
        asaas_payment_id: unknown;
        created_at: { lt: Date };
      };
      expect(where).toMatchObject({ scenario: 'public', status: 'pending', asaas_payment_id: { not: null } });
      // O corte é "agora − 48h", calculado durante a chamada: fica entre o
      // relógio de antes e o de depois dela. Com as margens invertidas o teste
      // só passava se a chamada durasse menos de 1ms — no CI, sob carga, não.
      const QUARENTA_E_OITO_HORAS = 48 * 60 * 60 * 1000;
      expect(where.created_at.lt.getTime()).toBeGreaterThanOrEqual(antes - QUARENTA_E_OITO_HORAS);
      expect(where.created_at.lt.getTime()).toBeLessThanOrEqual(depois - QUARENTA_E_OITO_HORAS);
      expect(cap.abandonedQuery).toMatchObject({ take: 100, orderBy: { created_at: 'asc' } });
    });

    it('sem nada abandonado, não fala com a Asaas nem grava', async () => {
      const { service, cap } = harness({ abandoned: [] });

      expect(await service.expireAbandonedPublicDonations()).toEqual({ cancelled: 0, kept: 0 });
      expect(cap.deletes).toEqual([]);
      expect(cap.closed).toEqual([]);
    });

    it('cancelamento recusado (cobrança talvez já paga, webhook perdido): a linha FICA pending e o caso vai para o log', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const { service, cap } = harness({ abandoned, httpDeleteStatus: 400 });

      const result = await service.expireAbandonedPublicDonations();

      expect(result).toEqual({ cancelled: 0, kept: 2 });
      expect(cap.closed).toEqual([]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('pay_a'));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('pix-a'));
    });

    it('Asaas fora do ar (erro sem status): mantém pending, tenta de novo no dia seguinte', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const { service, cap } = harness({ abandoned, httpDeleteFails: true });

      expect(await service.expireAbandonedPublicDonations()).toEqual({ cancelled: 0, kept: 2 });
      expect(cap.closed).toEqual([]);
    });

    it('404 (a cobrança já não existe na Asaas): nada a cancelar, marca `failed`', async () => {
      const { service, cap } = harness({ abandoned: [abandoned[0]], httpDeleteStatus: 404 });

      expect(await service.expireAbandonedPublicDonations()).toEqual({ cancelled: 1, kept: 0 });
      expect(cap.closed).toHaveLength(1);
    });

    it('uma falha não impede as demais cobranças do lote', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const { service, cap } = harness({
        abandoned,
        httpDelete: (url) => {
          if (url.endsWith('pay_a')) throw new Error('falhou só esta');
          return {};
        },
      });

      expect(await service.expireAbandonedPublicDonations()).toEqual({ cancelled: 1, kept: 1 });
      expect(cap.closed.map((c) => (c as { where: { id: string } }).where.id)).toEqual(['pix-b']);
    });

    it('sem ASAAS_API_KEY, pula a limpeza sem consultar o banco', async () => {
      delete process.env['ASAAS_API_KEY'];
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const { service, cap } = harness({ abandoned });

      expect(await service.expireAbandonedPublicDonations()).toEqual({ cancelled: 0, kept: 0 });
      expect(cap.abandonedQuery).toBeUndefined();
      expect(cap.deletes).toEqual([]);
    });
  });

  describe('listPublicIntents (DPUB-26)', () => {
    const intent = (extra: Record<string, unknown> = {}) => ({
      id: '8c9f9a52-3b2e-4a40-9d63-6c6a2f0a1b11',
      amount: new Prisma.Decimal('50.00'),
      status: 'pending',
      created_at: new Date('2026-10-01T12:00:00Z'),
      paid_at: null,
      donor_name: 'Ana',
      donor_email: 'ana@igreja.com',
      asaas_payment_id: null,
      category: { name: 'Oferta' },
      ...extra,
    });
    const query = { page: 1, page_size: 20 };

    it('devolve referência, valor, estado, doador declarado e categoria, mais o total', async () => {
      const { service } = harness({ intents: [intent()], intentsTotal: 7 });

      const result = await service.listPublicIntents(user, query);

      expect(result.total).toBe(7);
      expect(result.data).toEqual([
        {
          id: '8c9f9a52-3b2e-4a40-9d63-6c6a2f0a1b11',
          reference: 'PIX-8C9F9A52',
          amount: '50',
          status: 'pending',
          mode: 'static',
          donor_name: 'Ana',
          donor_email: 'ana@igreja.com',
          category_name: 'Oferta',
          created_at: new Date('2026-10-01T12:00:00Z'),
          paid_at: null,
        },
      ]);
    });

    it('com cobrança na Asaas a intenção é `dynamic`; sem, `static`', async () => {
      const { service } = harness({
        intents: [intent({ asaas_payment_id: 'pay_1' }), intent({ asaas_payment_id: null })],
      });

      const result = await service.listPublicIntents(user, query);

      expect(result.data.map((r) => r.mode)).toEqual(['dynamic', 'static']);
    });

    it('só lista o cenário `public` da tenant e da congregação da sessão, tanto nas linhas quanto no total', async () => {
      const { service, cap } = harness();

      await service.listPublicIntents(user, query);

      const esperado = { tenant_id: 't1', congregation_id: 'c1', scenario: 'public' };
      expect(cap.intentsFindMany?.['where']).toEqual(esperado);
      expect(cap.intentsCountWhere).toEqual(esperado);
    });

    it('filtra por estado quando pedido', async () => {
      const { service, cap } = harness();

      await service.listPublicIntents(user, { ...query, status: 'pending' as never });

      expect(cap.intentsFindMany?.['where']).toEqual({
        tenant_id: 't1',
        congregation_id: 'c1',
        scenario: 'public',
        status: 'pending',
      });
      expect(cap.intentsCountWhere).toMatchObject({ status: 'pending' });
    });

    it('as mais novas primeiro, paginadas', async () => {
      const { service, cap } = harness();

      await service.listPublicIntents(user, { page: 3, page_size: 10 });

      expect(cap.intentsFindMany).toMatchObject({
        orderBy: { created_at: 'desc' },
        skip: 20,
        take: 10,
      });
    });

    it('lista vazia: data vazia e total zero', async () => {
      const { service } = harness();

      expect(await service.listPublicIntents(user, query)).toEqual({ data: [], total: 0 });
    });
  });

  describe('settlePublicIntent — baixa manual da chave estática (DPUB-26)', () => {
    const ID = '8c9f9a52-3b2e-4a40-9d63-6c6a2f0a1b11';
    const estatica = (extra: Record<string, unknown> = {}) => ({
      id: ID,
      tenant_id: 't1',
      congregation_id: 'c1',
      amount: new Prisma.Decimal('50.00'),
      status: 'pending',
      category_id: 'cat-oferta',
      asaas_payment_id: null,
      donor_name: null,
      donor_email: null,
      donor_consent_version: null,
      ...extra,
    });

    it('intenção inexistente (ou de outra igreja/congregação): 404 e nada é criado', async () => {
      const { service, cap } = harness({ pixPayment: null });

      await expect(service.settlePublicIntent(ID, user)).rejects.toBeInstanceOf(NotFoundException);
      expect(cap.transactions).toEqual([]);
    });

    it('procura só no cenário `public`, na tenant e na congregação da sessão', async () => {
      const { service, cap } = harness({ pixPayment: estatica() });

      await service.settlePublicIntent(ID, user);

      expect(cap.findFirstArgs[0]).toMatchObject({
        where: { id: ID, tenant_id: 't1', congregation_id: 'c1', scenario: 'public' },
      });
    });

    it('intenção com cobrança na Asaas: 409 — quem confirma é o webhook; nenhum lançamento', async () => {
      const { service, cap } = harness({ pixPayment: estatica({ asaas_payment_id: 'pay_1' }) });

      await expect(service.settlePublicIntent(ID, user)).rejects.toBeInstanceOf(ConflictException);
      expect(cap.transactions).toEqual([]);
      expect(cap.updates).toEqual([]);
    });

    it('pendente: confirma e cria 1 lançamento de receita manual, na categoria da linha, por quem deu a baixa', async () => {
      const { service, cap } = harness({ pixPayment: estatica() });

      const result = await service.settlePublicIntent(ID, user);

      expect(result).toEqual({ id: ID, status: 'confirmed' });
      expect(cap.updates[0]).toMatchObject({
        where: { id: ID, status: { in: ['pending', 'failed'] } },
        data: { status: 'confirmed' },
      });
      expect(cap.transactions).toHaveLength(1);
      expect(cap.transactions[0]).toMatchObject({
        tenant_id: 't1',
        congregation_id: 'c1',
        type: 'income',
        source: 'manual',
        category_id: 'cat-oferta',
        created_by_user_id: 'user-1',
        description: 'Doação pública via PIX (baixa manual)',
      });
      expect(String(cap.transactions[0]?.['amount'])).toBe('50');
    });

    it('linha `failed` (limpeza já rodou) também aceita a baixa', async () => {
      const { service, cap } = harness({ pixPayment: estatica({ status: 'failed' }) });

      await service.settlePublicIntent(ID, user);

      expect(cap.transactions).toHaveLength(1);
    });

    it('já confirmada: devolve o estado, sem lançamento, sem auditoria nova', async () => {
      const { service, cap } = harness({ pixPayment: estatica({ status: 'confirmed' }) });

      const result = await service.settlePublicIntent(ID, user);

      expect(result).toEqual({ id: ID, status: 'confirmed' });
      expect(cap.transactions).toEqual([]);
      expect(cap.audits).toEqual([]);
    });

    it('duas baixas: a segunda não cria outro lançamento', async () => {
      const { service, cap } = harness({ pixPayment: estatica() });

      await service.settlePublicIntent(ID, user);
      await service.settlePublicIntent(ID, user);

      expect(cap.transactions).toHaveLength(1);
    });

    it('perdeu a corrida (outra baixa confirmou entre a leitura e a escrita): sem lançamento e sem auditoria', async () => {
      const { service, cap } = harness({ pixPayment: estatica(), perdeCorrida: true });

      const result = await service.settlePublicIntent(ID, user);

      expect(result).toEqual({ id: ID, status: 'confirmed' });
      expect(cap.transactions).toEqual([]);
      expect(cap.audits).toEqual([]);
    });

    it('deixa rastro em audit_logs, em nome de quem deu a baixa', async () => {
      const { service, cap } = harness({ pixPayment: estatica() });

      await service.settlePublicIntent(ID, user);

      expect(cap.audits).toEqual([
        {
          tenant_id: 't1',
          congregation_id: 'c1',
          actor_user_id: 'user-1',
          entity: 'pix_payment',
          action: 'pix.settled_manually',
          after: { pix_payment_id: ID, transaction_id: 'tx-1' },
        },
      ]);
    });

    it('sessão de suporte: o autor da auditoria é quem impersonou', async () => {
      const { service, cap } = harness({ pixPayment: estatica() });

      await service.settlePublicIntent(ID, { ...user, impersonated_by: 'suporte-9' });

      expect(cap.audits[0]).toMatchObject({ actor_user_id: 'suporte-9' });
    });

    it('falha da auditoria não desfaz a baixa', async () => {
      const { service, cap } = harness({ pixPayment: estatica(), auditThrows: true });

      await expect(service.settlePublicIntent(ID, user)).resolves.toEqual({ id: ID, status: 'confirmed' });
      expect(cap.transactions).toHaveLength(1);
    });

    describe('recibo', () => {
      it('doador declarou e-mail com aceite: o recibo é pedido com o doador declarado, no request', async () => {
        const { service, cap } = harness({
          pixPayment: estatica({
            donor_name: 'Ana',
            donor_email: 'ana@igreja.com',
            donor_consent_version: 'donor_consent_v1',
          }),
        });

        await service.settlePublicIntent(ID, user);

        expect(cap.receiptCalls).toEqual(['tx-1']);
        expect(cap.receiptDonors).toEqual([{ name: 'Ana', email: 'ana@igreja.com' }]);
        // Já está dentro da transação do request: não repassa escopo de RLS.
        expect(cap.receiptScopes).toEqual([undefined]);
      });

      it('e-mail sem aceite gravado: pede o recibo sem doador declarado (anônimo)', async () => {
        const { service, cap } = harness({
          pixPayment: estatica({ donor_name: 'Ana', donor_email: 'ana@igreja.com' }),
        });

        await service.settlePublicIntent(ID, user);

        expect(cap.receiptDonors).toEqual([undefined]);
      });

      it('falha do recibo (e-mail fora do ar) não desfaz a baixa', async () => {
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        const { service, cap } = harness({ pixPayment: estatica(), receiptRejects: true });

        await expect(service.settlePublicIntent(ID, user)).resolves.toEqual({ id: ID, status: 'confirmed' });

        expect(cap.transactions).toHaveLength(1);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('tx-1'));
      });
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

  describe('handleWebhook — escopo de RLS (DPUB-06)', () => {
    beforeEach(() => {
      process.env['ASAAS_WEBHOOK_TOKEN'] = 'segredo';
    });

    it('pede o escopo à função SQL pelo id do pagamento, sem assinatura quando o payload não traz', async () => {
      const { service, cap } = harness();

      await service.handleWebhook({ event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_123' } }, 'segredo');

      expect(cap.scopeQueries).toEqual([['pay_123', null]]);
    });

    it('passa também a assinatura quando o payload a traz (cobrança recorrente nova)', async () => {
      const { service, cap } = harness({ pixPayment: null });

      await service.handleWebhook(
        { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_novo', subscription: 'sub_asaas_1' } },
        'segredo',
      );

      expect(cap.scopeQueries).toEqual([['pay_novo', 'sub_asaas_1']]);
    });

    it('fixa app.tenant_id e app.congregation_id com o escopo devolvido, ANTES de ler a linha', async () => {
      const { service, cap } = harness({
        webhookScope: [{ scope_tenant_id: 'tenant-dono', scope_congregation_id: 'cong-dona' }],
      });

      await service.handleWebhook({ event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_123' } }, 'segredo');

      expect(cap.contexts[0]).toEqual(['tenant-dono', 'cong-dona']);
      expect(cap.contextsAtRead[0]).toBe(1);
    });

    it('id da Asaas sem escopo: 200, nenhum contexto fixado, nada lido nem lançado', async () => {
      const { service, cap } = harness({ webhookScope: [] });

      const result = await service.handleWebhook(
        { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_de_outro_ambiente' } },
        'segredo',
      );

      expect(result).toEqual({ received: true });
      expect(cap.contexts).toEqual([]);
      expect(cap.contextsAtRead).toEqual([]);
      expect(cap.transactions).toEqual([]);
    });

    it('escopo achado, mas a linha sumiu e o payload não traz assinatura: 200, nada lançado', async () => {
      // Entre a função SQL e a leitura sob contexto a linha pode ter sido
      // removida (ou o id é de outra igreja que a RLS esconde): nada a confirmar.
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const { service, cap } = harness({
        pixPayment: null,
        pixSubscription: null,
        webhookScope: [{ scope_tenant_id: 't1', scope_congregation_id: 'c1' }],
      });

      const result = await service.handleWebhook(
        { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_sumiu' } },
        'segredo',
      );

      expect(result).toEqual({ received: true });
      expect(cap.transactions).toEqual([]);
      expect(warn).toHaveBeenCalledWith('PixPayment não encontrado para asaas_id=pay_sumiu');
    });

    it('o contexto vem da função SQL, nunca do payload — tenant forjado no corpo é ignorado', async () => {
      const { service, cap } = harness({
        webhookScope: [{ scope_tenant_id: 'tenant-dono', scope_congregation_id: 'cong-dona' }],
      });

      await service.handleWebhook(
        {
          event: 'PAYMENT_CONFIRMED',
          tenant_id: 'tenant-forjado',
          payment: { id: 'pay_123', externalReference: 'tenant-forjado' },
        },
        'segredo',
      );

      expect(cap.contexts[0]).toEqual(['tenant-dono', 'cong-dona']);
    });

    it('o aviso de "sem payment.id" não despeja o payload (nome/CPF do pagador) no log', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const { service } = harness();

      await service.handleWebhook(
        { event: 'PAYMENT_CONFIRMED', payment: { customer: { name: 'Fulano', cpfCnpj: '12345678900' } } },
        'segredo',
      );

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]).toEqual(['Webhook sem payment.id (event=PAYMENT_CONFIRMED)']);
    });

    it('token com o mesmo tamanho do segredo, mas diferente, é 401', async () => {
      const { service } = harness();

      await expect(
        service.handleWebhook({ event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_123' } }, 'segredx'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('token válido mas de tamanho diferente do segredo não lança erro de buffer — é 401', async () => {
      const { service } = harness();

      await expect(
        service.handleWebhook({ event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_123' } }, 'segredo-bem-mais-longo'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
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

    it('carrega o donor_person_id do PixPayment para o lançamento — sem isso o job de retenção de Person não vê o vínculo financeiro', async () => {
      const { service, cap } = harness({
        pixPayment: {
          id: 'pix-1',
          tenant_id: 't1',
          congregation_id: 'c1',
          amount: new Prisma.Decimal('50.00'),
          category_id: 'cat-oferta',
          status: 'pending',
          donor_person_id: 'pessoa-7',
        },
      });

      await service.handleWebhook(
        { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_123' } },
        'segredo',
      );

      expect(cap.transactions[0]).toMatchObject({ donor_person_id: 'pessoa-7' });
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

    describe('PIX recorrente (PROD-27) — cobrança gerada pela assinatura Asaas', () => {
      it('sem PixPayment prévio, materializa a linha a partir de `payment.subscription` e confirma', async () => {
        const { service, cap } = harness({ pixPayment: null });

        const result = await service.handleWebhook(
          {
            event: 'PAYMENT_CONFIRMED',
            payment: { id: 'pay_recorrente_1', subscription: 'sub_asaas_1', value: '50.00' },
          },
          'segredo',
        );

        expect(result).toEqual({ received: true });
        expect(cap.pixPayments).toHaveLength(1);
        expect(cap.pixPayments[0]).toMatchObject({
          scenario: 'recurring',
          status: 'pending',
          asaas_payment_id: 'pay_recorrente_1',
          pix_subscription_id: 'sub-1',
          category_id: 'cat-oferta',
          donor_person_id: 'donor-1',
        });
        expect(cap.transactions).toHaveLength(1);
        expect(cap.transactions[0]).toMatchObject({
          description: 'PIX recorrente confirmado via Asaas',
          category_id: 'cat-oferta',
          donor_person_id: 'donor-1',
        });
      });

      it('assinatura cancelada não gera lançamento — evento em trânsito na hora do cancelamento', async () => {
        const { service, cap } = harness({
          pixPayment: null,
          pixSubscription: {
            id: 'sub-1',
            tenant_id: 't1',
            congregation_id: 'c1',
            donor_person_id: 'donor-1',
            category_id: 'cat-oferta',
            asaas_subscription_id: 'sub_asaas_1',
            status: 'cancelled',
          },
        });

        const result = await service.handleWebhook(
          { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_recorrente_1', subscription: 'sub_asaas_1' } },
          'segredo',
        );

        expect(result).toEqual({ received: true });
        expect(cap.pixPayments).toEqual([]);
        expect(cap.transactions).toEqual([]);
      });

      it('`payment.subscription` sem assinatura correspondente é ignorado, como pagamento desconhecido', async () => {
        const { service, cap } = harness({ pixPayment: null, pixSubscription: null });

        const result = await service.handleWebhook(
          { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_recorrente_1', subscription: 'sub_desconhecida' } },
          'segredo',
        );

        expect(result).toEqual({ received: true });
        expect(cap.pixPayments).toEqual([]);
        expect(cap.transactions).toEqual([]);
      });

      it('é idempotente: reenvio do mesmo evento não duplica o lançamento', async () => {
        const { service, cap } = harness({ pixPayment: null });

        const payload = {
          event: 'PAYMENT_CONFIRMED',
          payment: { id: 'pay_recorrente_1', subscription: 'sub_asaas_1', value: '50.00' },
        };

        await service.handleWebhook(payload, 'segredo');
        await service.handleWebhook(payload, 'segredo');

        // A segunda entrega reaproveita a MESMA linha (achada por
        // `asaas_payment_id`, já `confirmed`) em vez de criar outra.
        expect(cap.pixPayments).toHaveLength(1);
        expect(cap.transactions).toHaveLength(1);
      });

      it('duas entregas concorrentes: quem perde a corrida no `create` (P2002) recarrega a linha da outra, em vez de falhar o webhook', async () => {
        const { service, cap } = harness({ pixPayment: null, raceOnReactiveCreate: true });

        const result = await service.handleWebhook(
          {
            event: 'PAYMENT_CONFIRMED',
            payment: { id: 'pay_recorrente_1', subscription: 'sub_asaas_1', value: '50.00' },
          },
          'segredo',
        );

        expect(result).toEqual({ received: true });
        // O `create` desta entrega rejeitou (unique de asaas_payment_id) —
        // nada gravado por ELA; a linha já existe por conta da "outra".
        expect(cap.pixPayments).toEqual([]);
        // Mesmo assim confirma e lança, reaproveitando a linha que a outra
        // entrega criou — webhook não falha por causa da corrida.
        expect(cap.transactions).toHaveLength(1);
      });

      it('erro do `create` reativo que NÃO é a unique de asaas_payment_id propaga — não é engolido como corrida', async () => {
        const { service, cap } = harness({ pixPayment: null, reactiveCreateThrowsUnknownError: true });

        await expect(
          service.handleWebhook(
            {
              event: 'PAYMENT_CONFIRMED',
              payment: { id: 'pay_recorrente_1', subscription: 'sub_asaas_1', value: '50.00' },
            },
            'segredo',
          ),
        ).rejects.toThrow('disco cheio');

        expect(cap.transactions).toEqual([]);
      });
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

    it('aciona a geração do recibo com o id do lançamento recém-criado', async () => {
      const { service, cap } = harness();

      await service.handleWebhook(
        { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_123' } },
        'segredo',
      );
      // fire-and-forget: dá uma volta no microtask queue antes de checar.
      await Promise.resolve();

      expect(cap.receiptCalls).toEqual(['tx-1']);
    });

    it('repassa ao recibo o tenant e a congregação da LINHA — o recibo roda depois do commit, sem contexto', async () => {
      const { service, cap } = harness({
        webhookScope: [{ scope_tenant_id: 'tenant-dono', scope_congregation_id: 'cong-dona' }],
      });

      await service.handleWebhook(
        { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_123' } },
        'segredo',
      );
      await Promise.resolve();

      expect(cap.receiptScopes).toEqual([{ tenantId: 'tenant-dono', congregationId: 'cong-dona' }]);
    });

    describe('recibo da doação pública: só com e-mail + aceite gravados na linha (DPUB-25)', () => {
      const publicaPaga = (extra: Record<string, unknown>) => ({
        id: 'pix-1',
        tenant_id: 't1',
        congregation_id: 'c1',
        amount: new Prisma.Decimal('50.00'),
        category_id: 'cat-oferta',
        status: 'pending',
        donor_person_id: null,
        scenario: 'public',
        donor_name: null,
        donor_email: null,
        donor_consent_version: null,
        ...extra,
      });

      const confirma = async (extra: Record<string, unknown>) => {
        const { service, cap } = harness({ pixPayment: publicaPaga(extra) });
        await service.handleWebhook({ event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_123' } }, 'segredo');
        await Promise.resolve();
        return cap;
      };

      it('e-mail + aceite: repassa nome e e-mail declarados ao recibo', async () => {
        const cap = await confirma({
          donor_name: 'Ana',
          donor_email: 'ana@igreja.com',
          donor_consent_version: 'donor_consent_v1',
        });

        expect(cap.receiptDonors).toEqual([{ name: 'Ana', email: 'ana@igreja.com' }]);
      });

      it('e-mail sem nome: repassa nome nulo', async () => {
        const cap = await confirma({ donor_email: 'ana@igreja.com', donor_consent_version: 'donor_consent_v1' });

        expect(cap.receiptDonors).toEqual([{ name: null, email: 'ana@igreja.com' }]);
      });

      it('e-mail SEM aceite gravado não vira destinatário', async () => {
        const cap = await confirma({ donor_name: 'Ana', donor_email: 'ana@igreja.com' });

        expect(cap.receiptDonors).toEqual([undefined]);
      });

      it('só o nome, sem e-mail: anônimo para fins de recibo', async () => {
        const cap = await confirma({ donor_name: 'Ana', donor_consent_version: 'donor_consent_v1' });

        expect(cap.receiptDonors).toEqual([undefined]);
      });

      it('fora do cenário público, o doador declarado nunca é repassado', async () => {
        const cap = await confirma({
          scenario: 'dynamic',
          donor_email: 'ana@igreja.com',
          donor_consent_version: 'donor_consent_v1',
        });

        expect(cap.receiptDonors).toEqual([undefined]);
      });
    });

    it('não aciona o recibo quando a confirmação perde a corrida', async () => {
      const { service, cap } = harness({ perdeCorrida: true });

      await service.handleWebhook(
        { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_123' } },
        'segredo',
      );
      await Promise.resolve();

      expect(cap.receiptCalls).toEqual([]);
    });

    it('falha na geração do recibo não derruba o webhook', async () => {
      const { service, cap } = harness({ receiptRejects: true });

      const result = await service.handleWebhook(
        { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_123' } },
        'segredo',
      );
      await Promise.resolve();

      expect(result).toEqual({ received: true });
      expect(cap.receiptCalls).toEqual(['tx-1']);
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

    it('inscrição de evento (PROD-24): confirma a vaga pendente na mesma transação, com descrição própria', async () => {
      const { service, cap } = harness({
        pixPayment: {
          id: 'pix-1',
          tenant_id: 't1',
          congregation_id: 'c1',
          amount: new Prisma.Decimal('50.00'),
          category_id: 'cat-oferta',
          status: 'pending',
          scenario: 'event_registration',
        },
      });

      await service.handleWebhook(
        { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_123' } },
        'segredo',
      );
      await Promise.resolve();

      expect(cap.transactions[0]).toMatchObject({ description: 'Inscrição de evento paga via Asaas' });
      expect(cap.eventRegistrationUpdates[0]).toMatchObject({
        where: { pix_payment_id: 'pix-1', status: 'pending_payment' },
        data: { status: 'confirmed', payment_status: 'paid' },
      });
      // Inscrição não é doação — não emite recibo.
      expect(cap.receiptCalls).toEqual([]);
    });

    it('inscrição de evento: webhook sem registro pendente correspondente só loga, não falha', async () => {
      // Pode acontecer se a inscrição foi cancelada entre o pedido e a
      // confirmação da Asaas — o `updateMany` não acha `pending_payment` para
      // atualizar, mas o pagamento em si segue confirmado normalmente.
      const { service, cap } = harness({
        pixPayment: {
          id: 'pix-1',
          tenant_id: 't1',
          congregation_id: 'c1',
          amount: new Prisma.Decimal('50.00'),
          category_id: 'cat-oferta',
          status: 'pending',
          scenario: 'event_registration',
        },
        eventRegistrationFinalizeCount: 0,
      });

      const result = await service.handleWebhook(
        { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_123' } },
        'segredo',
      );

      expect(result).toEqual({ received: true });
      expect(cap.transactions).toHaveLength(1);
      expect(cap.eventRegistrationUpdates).toHaveLength(1);
    });

    it('inscrição de evento: doação normal continua sem tocar em event_registration nem pular o recibo', async () => {
      const { service, cap } = harness();

      await service.handleWebhook(
        { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_123' } },
        'segredo',
      );
      await Promise.resolve();

      expect(cap.eventRegistrationUpdates).toEqual([]);
      expect(cap.receiptCalls).toEqual(['tx-1']);
    });

    it('doação pública (cenário `public`): lança com descrição própria e sem doador — o nome declarado não vira vínculo', async () => {
      const { service, cap } = harness({
        pixPayment: {
          id: 'pix-1',
          tenant_id: 't1',
          congregation_id: 'c1',
          amount: new Prisma.Decimal('50.00'),
          category_id: 'cat-oferta',
          status: 'pending',
          donor_person_id: null,
          scenario: 'public',
        },
      });

      await service.handleWebhook(
        { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_123', value: 50 } },
        'segredo',
      );

      expect(cap.transactions).toHaveLength(1);
      expect(cap.transactions[0]).toMatchObject({
        type: 'income',
        source: 'pix_webhook',
        description: 'Doação pública via PIX',
        category_id: 'cat-oferta',
        donor_person_id: null,
      });
    });

    it('linha `failed` (limpeza já rodou, mas o dinheiro entrou) é confirmada e lançada — o pagamento real prevalece (DPUB-09)', async () => {
      const { service, cap } = harness({
        pixPayment: {
          id: 'pix-1',
          tenant_id: 't1',
          congregation_id: 'c1',
          amount: new Prisma.Decimal('50.00'),
          category_id: 'cat-oferta',
          status: 'failed',
          donor_person_id: null,
          scenario: 'public',
        },
      });

      await service.handleWebhook(
        { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_123', value: 50 } },
        'segredo',
      );

      expect(cap.updates[0]).toMatchObject({
        where: { id: 'pix-1', status: { in: ['pending', 'failed'] } },
        data: { status: 'confirmed' },
      });
      expect(cap.transactions).toHaveLength(1);
    });

    it('linha `failed` reentregue depois de confirmada não duplica o lançamento', async () => {
      const { service, cap } = harness({
        pixPayment: {
          id: 'pix-1',
          tenant_id: 't1',
          congregation_id: 'c1',
          amount: new Prisma.Decimal('50.00'),
          category_id: 'cat-oferta',
          status: 'failed',
          donor_person_id: null,
          scenario: 'public',
        },
      });
      const evento = { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_123' } };

      await service.handleWebhook(evento, 'segredo');
      await service.handleWebhook({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_123' } }, 'segredo');

      expect(cap.transactions).toHaveLength(1);
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
