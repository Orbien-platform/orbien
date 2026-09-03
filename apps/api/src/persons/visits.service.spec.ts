import { BadRequestException } from '@nestjs/common';
import { VisitOrigin } from '@prisma/client';
import { VisitsService } from './visits.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClassificationService } from './classification.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['secretary'],
  plan: 'starter',
};

function serviceWith(overrides: { visitRecordCreate?: jest.Mock; checkAuto?: jest.Mock } = {}) {
  const visitRecordCreate = overrides.visitRecordCreate ?? jest.fn().mockResolvedValue({ id: 'v1' });
  const checkAuto = overrides.checkAuto ?? jest.fn().mockResolvedValue(false);

  const tx = { visitRecord: { create: visitRecordCreate } };
  const prisma = {
    client: { visitRecord: { findMany: jest.fn() } },
    runInTx: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaService;

  const classificationService = {
    checkAutoReclassification: checkAuto,
  } as unknown as ClassificationService;

  return { service: new VisitsService(prisma, classificationService), prisma, tx, visitRecordCreate, checkAuto };
}

describe('VisitsService', () => {
  describe('create', () => {
    it('lança BadRequestException quando origin é small_group sem small_group_id', async () => {
      const { service } = serviceWith();

      await expect(
        service.create({ person_id: 'p1', origin: VisitOrigin.small_group } as never, user),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cria a visita e propaga o resultado da reclassificação automática', async () => {
      const { service, checkAuto, visitRecordCreate } = serviceWith({
        checkAuto: jest.fn().mockResolvedValue(true),
      });

      const result = await service.create(
        { person_id: 'p1', origin: VisitOrigin.in_person } as never,
        user,
      );

      expect(visitRecordCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: 'tenant-1',
          congregation_id: 'cong-1',
          person_id: 'p1',
          origin: VisitOrigin.in_person,
          small_group_id: null,
        }),
      });
      expect(checkAuto).toHaveBeenCalledWith('p1', 'user-1', expect.anything());
      expect(result).toEqual({ visit: { id: 'v1' }, reclassified: true });
    });

    it('aceita small_group com small_group_id e usa visited_at explícito', async () => {
      const { service, visitRecordCreate } = serviceWith();
      const visitedAt = new Date('2026-01-15T10:00:00Z');

      await service.create(
        {
          person_id: 'p1',
          origin: VisitOrigin.small_group,
          small_group_id: 'sg1',
          visited_at: visitedAt,
        } as never,
        user,
      );

      expect(visitRecordCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ small_group_id: 'sg1', visited_at: visitedAt }),
      });
    });
  });

  describe('findByPerson', () => {
    it('busca as visitas da pessoa ordenadas da mais recente', async () => {
      const { service, prisma } = serviceWith();
      (prisma.client.visitRecord.findMany as jest.Mock).mockResolvedValue([{ id: 'v1' }]);

      const result = await service.findByPerson('p1');

      expect(prisma.client.visitRecord.findMany).toHaveBeenCalledWith({
        where: { person_id: 'p1' },
        orderBy: { visited_at: 'desc' },
      });
      expect(result).toEqual([{ id: 'v1' }]);
    });
  });
});
