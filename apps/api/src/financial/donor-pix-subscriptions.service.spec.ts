/**
 * Dízimo automático do próprio doador (PROD-28). O que esta suíte mede é o
 * que separa esta rota da do tesoureiro — e cada teste afirma o que a spec
 * pede, não como o serviço chega lá:
 *
 *   - a pessoa vem do banco (`user_accounts.person_id`), nunca do corpo;
 *   - o plano vem do banco (`tenant_plans`), nunca da claim;
 *   - toda leitura e todo cancelamento filtram pela pessoa do token — o RLS
 *     não separa um membro do outro na mesma congregação;
 *   - criar está atrás da trava; ver e cancelar, nunca.
 *
 * Spec: `.specs/features/pix-recorrente-doador-mobile/spec.md` (PRD-DONOR-02..07).
 */
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DonorPixSubscriptionsService } from './donor-pix-subscriptions.service';
import { PixService } from './pix.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateMyPixSubscriptionDto } from './dto/create-my-pix-subscription.dto';
import { DONOR_RECURRING_CONSENT_VERSION } from './donor-pix-subscriptions.constants';

const member: JwtPayload = {
  sub: 'conta-maria',
  tenant_id: 't1',
  congregation_id: 'c1',
  roles: ['member'],
  plan: 'premium',
};

const dto = { amount: 100, consent_version: DONOR_RECURRING_CONSENT_VERSION };

type Opts = {
  personId?: string | null;
  plan?: 'premium' | 'starter' | null;
  activeSubscription?: { id: string } | null;
  ownSubscription?: { id: string; status: string; asaas_subscription_id: string } | null;
};

function harness(opts: Opts = {}) {
  const cap = {
    accountLookups: [] as unknown[],
    findFirstWhere: [] as Record<string, unknown>[],
    findManyArgs: undefined as Record<string, unknown> | undefined,
  };

  const prisma = {
    client: {
      userAccount: {
        findUnique: (args: unknown) => {
          cap.accountLookups.push(args);
          const personId = opts.personId === undefined ? 'pessoa-maria' : opts.personId;
          return Promise.resolve({ person_id: personId });
        },
      },
      tenantPlan: {
        findUnique: () =>
          Promise.resolve(opts.plan === null ? null : { plan: opts.plan ?? 'premium' }),
      },
      pixSubscription: {
        findFirst: (args: { where: Record<string, unknown> }) => {
          cap.findFirstWhere.push(args.where);
          // A mesma consulta serve aos dois usos: "já tem ativa?" (criar) e
          // "esta é minha?" (cancelar) — distingue pelo `id` no where.
          if ('id' in args.where) {
            return Promise.resolve(
              opts.ownSubscription === undefined
                ? { id: 'sub-maria', status: 'active', asaas_subscription_id: 'sub_asaas_m' }
                : opts.ownSubscription,
            );
          }
          return Promise.resolve(opts.activeSubscription ?? null);
        },
        findMany: (args: Record<string, unknown>) => {
          cap.findManyArgs = args;
          return Promise.resolve([{ id: 'sub-maria' }]);
        },
      },
    },
  } as unknown as PrismaService;

  const pixService = {
    createSubscriptionFor: jest.fn((input: unknown) => Promise.resolve({ id: 'sub-nova', input })),
    cancelSubscriptionRow: jest.fn((row: { id: string }) =>
      Promise.resolve({ id: row.id, status: 'cancelled', asaas_subscription_id: 'x' }),
    ),
  };

  return {
    service: new DonorPixSubscriptionsService(prisma, pixService as unknown as PixService),
    pixService,
    cap,
  };
}

describe('DonorPixSubscriptionsService', () => {
  const flagOriginal = process.env['ASAAS_PAYMENTS_ENABLED'];
  beforeEach(() => {
    process.env['ASAAS_PAYMENTS_ENABLED'] = 'true';
  });
  afterEach(() => {
    if (flagOriginal === undefined) delete process.env['ASAAS_PAYMENTS_ENABLED'];
    else process.env['ASAAS_PAYMENTS_ENABLED'] = flagOriginal;
  });

  describe('create', () => {
    it('cria para a pessoa ligada à conta do token, lida no banco, com o aceite', async () => {
      const { service, pixService, cap } = harness();

      await service.create(dto, member);

      expect(cap.accountLookups).toEqual([
        expect.objectContaining({ where: { id: 'conta-maria' } }),
      ]);
      expect(pixService.createSubscriptionFor).toHaveBeenCalledWith(
        { donorPersonId: 'pessoa-maria', amount: 100, consentVersion: DONOR_RECURRING_CONSENT_VERSION },
        member,
      );
    });

    it('com a trava de pagamentos desligada, 503 — nem consulta a conta', async () => {
      delete process.env['ASAAS_PAYMENTS_ENABLED'];
      const { service, pixService, cap } = harness();

      await expect(service.create(dto, member)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(cap.accountLookups).toEqual([]);
      expect(pixService.createSubscriptionFor).not.toHaveBeenCalled();
    });

    it('plano do banco manda: claim `premium` com tenant Starter no banco é 403', async () => {
      const { service, pixService } = harness({ plan: 'starter' });

      await expect(service.create(dto, { ...member, plan: 'premium' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(pixService.createSubscriptionFor).not.toHaveBeenCalled();
    });

    it('tenant sem linha de plano no banco também é 403', async () => {
      const { service, pixService } = harness({ plan: null });

      await expect(service.create(dto, member)).rejects.toBeInstanceOf(ForbiddenException);
      expect(pixService.createSubscriptionFor).not.toHaveBeenCalled();
    });

    it('conta sem pessoa ligada é 409 e não chega à Asaas', async () => {
      const { service, pixService } = harness({ personId: null });

      await expect(service.create(dto, member)).rejects.toBeInstanceOf(ConflictException);
      expect(pixService.createSubscriptionFor).not.toHaveBeenCalled();
    });

    it('já tem assinatura ativa: 409 sem abrir outra na Asaas', async () => {
      const { service, pixService, cap } = harness({ activeSubscription: { id: 'sub-antiga' } });

      await expect(service.create(dto, member)).rejects.toBeInstanceOf(ConflictException);
      expect(cap.findFirstWhere[0]).toMatchObject({
        tenant_id: 't1',
        donor_person_id: 'pessoa-maria',
        status: 'active',
      });
      expect(pixService.createSubscriptionFor).not.toHaveBeenCalled();
    });

    it('sessão de suporte não contrata em nome do membro', async () => {
      const { service, pixService } = harness();

      await expect(service.create(dto, { ...member, support_session: true })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(pixService.createSubscriptionFor).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('lista só as da própria pessoa, no tenant da sessão', async () => {
      const { service, cap } = harness();

      await service.list(member);

      expect(cap.findManyArgs?.['where']).toEqual({
        tenant_id: 't1',
        donor_person_id: 'pessoa-maria',
      });
    });

    it('conta sem pessoa ligada: lista vazia, sem erro e sem consulta', async () => {
      const { service, cap } = harness({ personId: null });

      await expect(service.list(member)).resolves.toEqual([]);
      expect(cap.findManyArgs).toBeUndefined();
    });

    it('com a trava desligada e tenant Starter, ainda lista (quem tem assinatura precisa vê-la)', async () => {
      delete process.env['ASAAS_PAYMENTS_ENABLED'];
      const { service } = harness({ plan: 'starter' });

      await expect(service.list(member)).resolves.toEqual([{ id: 'sub-maria' }]);
    });
  });

  describe('cancel', () => {
    it('procura a assinatura pelo id E pela pessoa do token, e cancela pela rotina comum', async () => {
      const { service, pixService, cap } = harness();

      const result = await service.cancel('sub-maria', member);

      expect(cap.findFirstWhere[0]).toEqual({
        id: 'sub-maria',
        tenant_id: 't1',
        donor_person_id: 'pessoa-maria',
      });
      expect(pixService.cancelSubscriptionRow).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'sub-maria' }),
      );
      expect(result).toEqual({ id: 'sub-maria', status: 'cancelled' });
    });

    it('assinatura de outra pessoa (não casa com a pessoa do token) é 404, sem tocar na Asaas', async () => {
      const { service, pixService } = harness({ ownSubscription: null });

      await expect(service.cancel('sub-do-vizinho', member)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(pixService.cancelSubscriptionRow).not.toHaveBeenCalled();
    });

    it('conta sem pessoa ligada é 404', async () => {
      const { service, pixService } = harness({ personId: null });

      await expect(service.cancel('sub-maria', member)).rejects.toBeInstanceOf(NotFoundException);
      expect(pixService.cancelSubscriptionRow).not.toHaveBeenCalled();
    });

    it('cancelar não depende da trava nem do plano', async () => {
      delete process.env['ASAAS_PAYMENTS_ENABLED'];
      const { service, pixService } = harness({ plan: 'starter' });

      await service.cancel('sub-maria', member);

      expect(pixService.cancelSubscriptionRow).toHaveBeenCalled();
    });

    it('sessão de suporte não cancela em nome do membro', async () => {
      const { service, pixService } = harness();

      await expect(
        service.cancel('sub-maria', { ...member, support_session: true }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(pixService.cancelSubscriptionRow).not.toHaveBeenCalled();
    });
  });
});

describe('CreateMyPixSubscriptionDto', () => {
  // Mesmas opções do ValidationPipe global (main.ts).
  async function errors(body: Record<string, unknown>) {
    const instance = plainToInstance(CreateMyPixSubscriptionDto, body);
    return validate(instance, { whitelist: true, forbidNonWhitelisted: true });
  }

  it('aceita valor dentro dos limites com o aceite vigente', async () => {
    await expect(errors({ amount: 150.5, consent_version: DONOR_RECURRING_CONSENT_VERSION })).resolves.toEqual([]);
  });

  it('rejeita `donor_person_id` no corpo — o doador nunca escolhe a pessoa', async () => {
    const result = await errors({ ...dto, donor_person_id: '00000000-0000-4000-8000-000000000000' });
    expect(result.map((e) => e.property)).toContain('donor_person_id');
  });

  it('rejeita valor abaixo do mínimo, acima do máximo e com mais de 2 casas', async () => {
    for (const amount of [9.99, 5000.01, 50.123]) {
      const result = await errors({ ...dto, amount });
      expect(result.map((e) => e.property)).toEqual(['amount']);
    }
  });

  it('rejeita aceite ausente ou de versão antiga', async () => {
    expect((await errors({ amount: 50 })).map((e) => e.property)).toEqual(['consent_version']);
    expect(
      (await errors({ amount: 50, consent_version: 'dizimo-automatico-v0' })).map((e) => e.property),
    ).toEqual(['consent_version']);
  });
});
