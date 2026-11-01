import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { KidsConsentService } from './kids-consent.service';
import { KIDS_TERM_VERSION } from './kids-consent.terms';
import { PrismaService } from '../../prisma/prisma.service';
import type { KidsActor } from '../children/kids-child-access.service';

function clientWith() {
  return {
    person: { findFirst: jest.fn() },
    consentRecord: {
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  };
}

function serviceWith(client: ReturnType<typeof clientWith>, access: Partial<Record<'ownPersonId' | 'isManager', jest.Mock>> = {}) {
  const stub = {
    ownPersonId: jest.fn().mockResolvedValue('p-own'),
    isManager: jest.fn((roles: string[]) => roles.includes('secretary')),
    ...access,
  };
  return new KidsConsentService({ client } as unknown as PrismaService, stub as never);
}

describe('KidsConsentService', () => {
  describe('hasValidConsent', () => {
    it('é verdadeiro com consentimento de kids ou da secretaria não revogado', async () => {
      const client = clientWith();
      client.consentRecord.findFirst.mockResolvedValue({ id: 'c1' });

      await expect(serviceWith(client).hasValidConsent('p1')).resolves.toBe(true);
      expect(client.consentRecord.findFirst).toHaveBeenCalledWith({
        where: { person_id: 'p1', origin: { in: ['kids', 'secretaria'] }, revoked_at: null },
        select: { id: true },
      });
    });

    it('é falso sem registro vigente (nunca consentiu ou revogou)', async () => {
      const client = clientWith();
      client.consentRecord.findFirst.mockResolvedValue(null);

      await expect(serviceWith(client).hasValidConsent('p1')).resolves.toBe(false);
    });
  });

  describe('assertValidConsent', () => {
    it('recusa com 422 trazendo a versão e o texto do termo (AC 2)', async () => {
      const client = clientWith();
      client.consentRecord.findFirst.mockResolvedValue(null);

      const err = await serviceWith(client)
        .assertValidConsent('p1')
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(UnprocessableEntityException);
      const body = (err as UnprocessableEntityException).getResponse() as Record<string, unknown>;
      expect(body['code']).toBe('kids_consent_required');
      expect(body['term_version']).toBe(KIDS_TERM_VERSION);
      expect(typeof body['term_text']).toBe('string');
    });

    it('passa quando há consentimento vigente', async () => {
      const client = clientWith();
      client.consentRecord.findFirst.mockResolvedValue({ id: 'c1' });

      await expect(serviceWith(client).assertValidConsent('p1')).resolves.toBeUndefined();
    });
  });

  describe('grant', () => {
    it('registra origin kids com a versão do termo quando o próprio responsável aceita', async () => {
      const client = clientWith();
      client.person.findFirst.mockResolvedValue({ id: 'p1' });
      client.consentRecord.findFirst.mockResolvedValue(null);
      client.consentRecord.create.mockResolvedValue({ id: 'c1' });

      await serviceWith(client).grant('t1', 'g1', 'p1', 'kids', { ip: '1.2.3.4', userAgent: 'ua' });

      expect(client.consentRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: 't1',
          congregation_id: 'g1',
          person_id: 'p1',
          origin: 'kids',
          version: KIDS_TERM_VERSION,
          ip: '1.2.3.4',
          user_agent: 'ua',
        }),
      });
    });

    it('registra origin secretaria quando a secretaria lança pelo responsável (AC 7)', async () => {
      const client = clientWith();
      client.person.findFirst.mockResolvedValue({ id: 'p1' });
      client.consentRecord.findFirst.mockResolvedValue(null);
      client.consentRecord.create.mockResolvedValue({ id: 'c1' });

      await serviceWith(client).grant('t1', 'g1', 'p1', 'secretaria', {});

      expect(client.consentRecord.create.mock.calls[0][0].data.origin).toBe('secretaria');
    });

    it('é idempotente: já havendo consentimento vigente, não cria outro', async () => {
      const client = clientWith();
      client.person.findFirst.mockResolvedValue({ id: 'p1' });
      client.consentRecord.findFirst.mockResolvedValue({ id: 'c0', origin: 'kids' });

      const result = await serviceWith(client).grant('t1', 'g1', 'p1', 'kids', {});

      expect(client.consentRecord.create).not.toHaveBeenCalled();
      expect(result).toMatchObject({ id: 'c0' });
    });

    it('404 se o responsável não existe na congregação, é criança ou foi removido', async () => {
      const client = clientWith();
      client.person.findFirst.mockResolvedValue(null);

      await expect(serviceWith(client).grant('t1', 'g1', 'px', 'kids', {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(client.person.findFirst).toHaveBeenCalledWith({
        where: { id: 'px', tenant_id: 't1', congregation_id: 'g1', is_child: false, deleted_at: null },
        select: { id: true },
      });
      expect(client.consentRecord.create).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('revoga os consentimentos vigentes de kids com data e motivo, preservando o histórico (AC 6)', async () => {
      const client = clientWith();
      client.consentRecord.updateMany.mockResolvedValue({ count: 1 });

      const result = await serviceWith(client).revoke('p1', 'Não quero mais');

      expect(client.consentRecord.updateMany).toHaveBeenCalledWith({
        where: { person_id: 'p1', origin: { in: ['kids', 'secretaria'] }, revoked_at: null },
        data: { revoked_at: expect.any(Date), revocation_reason: 'Não quero mais' },
      });
      expect(result).toEqual({ revoked: 1 });
    });

    it('sem motivo informado, grava revocation_reason nulo; nada vigente revoga 0', async () => {
      const client = clientWith();
      client.consentRecord.updateMany.mockResolvedValue({ count: 0 });

      const result = await serviceWith(client).revoke('p1');

      expect(client.consentRecord.updateMany.mock.calls[0][0].data).toEqual({
        revoked_at: expect.any(Date),
        revocation_reason: null,
      });
      expect(result).toEqual({ revoked: 0 });
    });
  });
});

describe('KidsConsentService — pedidos do usuário (POST /kids/consent)', () => {
  const resp: KidsActor = { userId: 'u1', tenantId: 't1', congregationId: 'g1', roles: ['member'] };
  const sec: KidsActor = { userId: 'u2', tenantId: 't1', congregationId: 'g1', roles: ['secretary'] };

  function ready() {
    const client = clientWith();
    client.person.findFirst.mockResolvedValue({ id: 'p-own' });
    client.consentRecord.findFirst.mockResolvedValue(null);
    client.consentRecord.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'c1', ...data }));
    return client;
  }

  it('o responsável aceita o próprio termo: origin kids, na pessoa da conta', async () => {
    const client = ready();

    const result = await serviceWith(client).register(resp, { term_version: KIDS_TERM_VERSION }, {});

    expect(client.consentRecord.create.mock.calls[0][0].data).toMatchObject({ person_id: 'p-own', origin: 'kids' });
    expect(result).toMatchObject({ valid: true, origin: 'kids', version: KIDS_TERM_VERSION });
  });

  it('a secretaria aceita por outra pessoa: origin secretaria (AC 7)', async () => {
    const client = ready();

    await serviceWith(client).register(sec, { term_version: KIDS_TERM_VERSION, guardian_person_id: 'p-outro' }, {});

    expect(client.consentRecord.create.mock.calls[0][0].data).toMatchObject({ person_id: 'p-outro', origin: 'secretaria' });
  });

  it('quem não é da gestão não registra por outra pessoa: 403', async () => {
    const client = ready();

    await expect(
      serviceWith(client).register(resp, { term_version: KIDS_TERM_VERSION, guardian_person_id: 'p-outro' }, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(client.consentRecord.create).not.toHaveBeenCalled();
  });

  it('versão do termo desatualizada: 409 com o termo vigente, nada gravado', async () => {
    const client = ready();

    const err = await serviceWith(client)
      .register(resp, { term_version: 'kids-antigo' }, {})
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ConflictException);
    expect(((err as ConflictException).getResponse() as Record<string, unknown>)['term_version']).toBe(KIDS_TERM_VERSION);
    expect(client.consentRecord.create).not.toHaveBeenCalled();
  });

  it('conta sem pessoa vinculada: 403', async () => {
    const client = ready();

    await expect(
      serviceWith(client, { ownPersonId: jest.fn().mockResolvedValue(null) }).register(resp, { term_version: KIDS_TERM_VERSION }, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('status devolve validade e o termo vigente', async () => {
    const client = ready();
    client.consentRecord.findFirst.mockResolvedValue({ id: 'c1' });

    await expect(serviceWith(client).status(resp)).resolves.toMatchObject({
      valid: true,
      term_version: KIDS_TERM_VERSION,
      term_text: expect.any(String),
    });
  });

  it('revokeFor revoga o consentimento do próprio responsável', async () => {
    const client = ready();
    client.consentRecord.updateMany.mockResolvedValue({ count: 1 });

    await serviceWith(client).revokeFor(resp, { reason: 'x' });

    expect(client.consentRecord.updateMany.mock.calls[0][0].where).toMatchObject({ person_id: 'p-own' });
  });
});
