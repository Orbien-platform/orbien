import { NotFoundException } from '@nestjs/common';
import { VisitorService } from './visitor.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClassificationService } from '../persons/classification.service';
import { VisitsService } from '../persons/visits.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateQrTokenDto } from './dto/create-qr-token.dto';

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['secretary'],
  plan: 'starter',
};

function serviceWith() {
  const qrTokenClient = {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
  };

  const tx = {
    person: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
    consentRecord: { create: jest.fn().mockResolvedValue({}) },
    visitRecord: { create: jest.fn().mockResolvedValue({}) },
  };

  const prisma = {
    client: { qrToken: qrTokenClient },
    runInTx: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaService;

  const classificationService = {
    checkAutoReclassification: jest.fn().mockResolvedValue(false),
  } as unknown as ClassificationService;
  const visitsService = {} as VisitsService;

  return {
    service: new VisitorService(prisma, classificationService, visitsService),
    qrTokenClient,
    tx,
    classificationService,
  };
}

describe('VisitorService', () => {
  describe('registerViaQr', () => {
    it('lança NotFoundException quando o QR não existe', async () => {
      const { service, qrTokenClient } = serviceWith();
      qrTokenClient.findUnique.mockResolvedValue(null);

      await expect(
        service.registerViaQr({ token: 'x' } as never, '1.2.3.4', 'ua'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lança NotFoundException quando o QR está inativo', async () => {
      const { service, qrTokenClient } = serviceWith();
      qrTokenClient.findUnique.mockResolvedValue({ id: 'qr1', is_active: false });

      await expect(
        service.registerViaQr({ token: 'x' } as never, '1.2.3.4', 'ua'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('incrementa scan_count e cadastra nova pessoa quando não há telefone correspondente', async () => {
      const { service, qrTokenClient, tx } = serviceWith();
      qrTokenClient.findUnique.mockResolvedValue({
        id: 'qr1',
        is_active: true,
        tenant_id: 'tenant-1',
        congregation_id: 'cong-1',
        origin: 'service',
        small_group_id: null,
        created_by: 'creator-1',
        congregation: { name: 'Sede' },
      });
      tx.person.create.mockResolvedValue({ id: 'p1', full_name: 'Ana Nova' });

      const result = await service.registerViaQr(
        { token: 'tok', full_name: 'Ana Nova', phone: undefined } as never,
        '1.2.3.4',
        'ua',
      );

      expect(qrTokenClient.update).toHaveBeenCalledWith({
        where: { id: 'qr1' },
        data: { scan_count: { increment: 1 } },
      });
      expect(tx.person.create).toHaveBeenCalled();
      expect(tx.consentRecord.create).toHaveBeenCalled();
      expect(tx.visitRecord.create).toHaveBeenCalled();
      expect(result).toEqual({
        status: 'registered',
        message: 'Cadastro realizado! Bem-vindo à Sede.',
      });
    });

    it('reconhece pessoa existente pelo telefone e registra visita, sem criar pessoa nova', async () => {
      const { service, qrTokenClient, tx } = serviceWith();
      qrTokenClient.findUnique.mockResolvedValue({
        id: 'qr1',
        is_active: true,
        tenant_id: 'tenant-1',
        congregation_id: 'cong-1',
        origin: 'service',
        small_group_id: null,
        created_by: 'creator-1',
        congregation: { name: 'Sede' },
      });
      tx.person.findFirst.mockResolvedValue({ id: 'p1', full_name: 'João Existente' });

      const result = await service.registerViaQr(
        { token: 'tok', full_name: 'João', phone: '+5511999999999' } as never,
        '1.2.3.4',
        'ua',
      );

      expect(tx.person.create).not.toHaveBeenCalled();
      expect(result).toEqual({ status: 'visit_recorded', message: 'Tudo certo, João! Sua presença foi registrada.' });
    });

    it('usa o primeiro user-agent quando o header vem como array', async () => {
      const { service, qrTokenClient, tx } = serviceWith();
      qrTokenClient.findUnique.mockResolvedValue({
        id: 'qr1',
        is_active: true,
        tenant_id: 'tenant-1',
        congregation_id: 'cong-1',
        origin: 'service',
        small_group_id: null,
        created_by: 'creator-1',
        congregation: { name: 'Sede' },
      });
      tx.person.create.mockResolvedValue({ id: 'p1', full_name: 'Ana' });

      await service.registerViaQr(
        { token: 'tok', full_name: 'Ana' } as never,
        undefined,
        ['agent-a', 'agent-b'],
      );

      expect(tx.consentRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ user_agent: 'agent-a', ip: null }) }),
      );
    });

    it('grava user_agent nulo quando o header não vem (nem string, nem array)', async () => {
      const { service, qrTokenClient, tx } = serviceWith();
      qrTokenClient.findUnique.mockResolvedValue({
        id: 'qr1',
        is_active: true,
        tenant_id: 'tenant-1',
        congregation_id: 'cong-1',
        origin: 'service',
        small_group_id: null,
        created_by: 'creator-1',
        congregation: { name: 'Sede' },
      });
      tx.person.create.mockResolvedValue({ id: 'p1', full_name: 'Ana' });

      await service.registerViaQr({ token: 'tok', full_name: 'Ana' } as never, undefined, undefined);

      expect(tx.consentRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ user_agent: null }) }),
      );
    });
  });

  describe('createQrToken', () => {
    it('cria QR com tenant/congregação do usuário e defaults', async () => {
      const { service, qrTokenClient } = serviceWith();
      qrTokenClient.create.mockResolvedValue({ id: 'qr1' });
      const dto: CreateQrTokenDto = { origin: 'service' } as CreateQrTokenDto;

      const result = await service.createQrToken(dto, user);

      expect(qrTokenClient.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 'tenant-1',
          congregation_id: 'cong-1',
          origin: 'service',
          small_group_id: null,
          label: null,
          is_active: true,
          created_by: 'user-1',
        },
      });
      expect(result).toEqual({ id: 'qr1' });
    });

    it('respeita is_active explícito e small_group_id/label informados', async () => {
      const { service, qrTokenClient } = serviceWith();
      qrTokenClient.create.mockResolvedValue({ id: 'qr1' });

      await service.createQrToken(
        { origin: 'service', small_group_id: 'sg1', label: 'Entrada', is_active: false } as CreateQrTokenDto,
        user,
      );

      expect(qrTokenClient.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ small_group_id: 'sg1', label: 'Entrada', is_active: false }),
      });
    });
  });

  describe('listQrTokens', () => {
    it('lista os QR do tenant/congregação, mais recentes primeiro', async () => {
      const { service, qrTokenClient } = serviceWith();
      qrTokenClient.findMany.mockResolvedValue([{ id: 'qr1' }]);

      const result = await service.listQrTokens(user);

      expect(qrTokenClient.findMany).toHaveBeenCalledWith({
        where: { tenant_id: 'tenant-1', congregation_id: 'cong-1' },
        orderBy: { created_at: 'desc' },
      });
      expect(result).toEqual([{ id: 'qr1' }]);
    });
  });

  describe('toggleQrToken', () => {
    it('lança NotFoundException quando o QR não existe no tenant/congregação', async () => {
      const { service, qrTokenClient } = serviceWith();
      qrTokenClient.findFirst.mockResolvedValue(null);

      await expect(service.toggleQrToken('qr1', user)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('inverte is_active', async () => {
      const { service, qrTokenClient } = serviceWith();
      qrTokenClient.findFirst.mockResolvedValue({ id: 'qr1', is_active: true });
      qrTokenClient.update.mockResolvedValue({ id: 'qr1', is_active: false });

      const result = await service.toggleQrToken('qr1', user);

      expect(qrTokenClient.update).toHaveBeenCalledWith({ where: { id: 'qr1' }, data: { is_active: false } });
      expect(result).toEqual({ id: 'qr1', is_active: false });
    });
  });
});
