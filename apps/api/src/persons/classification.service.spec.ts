import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PersonClassification } from '@prisma/client';
import { ClassificationService } from './classification.service';
import { PrismaService } from '../prisma/prisma.service';

// `reclassify` e `checkAutoReclassification` rodam dentro da transação do
// chamador — recebem `tx`, não `this.prisma`. O mock aqui é do formato do
// PrismaTx (subconjunto do PrismaClient), não do PrismaService inteiro.
function txWith(overrides: Record<string, unknown> = {}) {
  return {
    person: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    classificationHistory: {
      create: jest.fn(),
    },
    visitRecord: {
      count: jest.fn(),
    },
    ...overrides,
  } as never;
}

describe('ClassificationService', () => {
  describe('reclassify (dentro da tx do chamador)', () => {
    it('lança NotFoundException quando a pessoa não existe', async () => {
      const prisma = { client: {} } as unknown as PrismaService;
      const service = new ClassificationService(prisma);
      const tx = txWith();
      (tx as { person: { findUnique: jest.Mock } }).person.findUnique.mockResolvedValue(null);

      await expect(
        service.reclassify('p1', PersonClassification.member, 'motivo', 'u1', tx),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('é no-op quando a classificação já é a de destino', async () => {
      const prisma = { client: {} } as unknown as PrismaService;
      const service = new ClassificationService(prisma);
      const tx = txWith();
      (tx as { person: { findUnique: jest.Mock } }).person.findUnique.mockResolvedValue({
        id: 'p1',
        classification: PersonClassification.member,
        tenant_id: 't1',
        congregation_id: 'c1',
      });

      await service.reclassify('p1', PersonClassification.member, 'motivo', 'u1', tx);

      expect((tx as { person: { update: jest.Mock } }).person.update).not.toHaveBeenCalled();
      expect(
        (tx as { classificationHistory: { create: jest.Mock } }).classificationHistory.create,
      ).not.toHaveBeenCalled();
    });

    it('atualiza a classificação e grava o histórico quando muda', async () => {
      const prisma = { client: {} } as unknown as PrismaService;
      const service = new ClassificationService(prisma);
      const tx = txWith();
      (tx as { person: { findUnique: jest.Mock } }).person.findUnique.mockResolvedValue({
        id: 'p1',
        classification: PersonClassification.visitor,
        tenant_id: 't1',
        congregation_id: 'c1',
      });

      await service.reclassify('p1', PersonClassification.attendee, 'motivo', 'u1', tx);

      expect((tx as { person: { update: jest.Mock } }).person.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { classification: PersonClassification.attendee },
      });
      expect(
        (tx as { classificationHistory: { create: jest.Mock } }).classificationHistory.create,
      ).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: 't1',
          congregation_id: 'c1',
          person_id: 'p1',
          from_classification: PersonClassification.visitor,
          to_classification: PersonClassification.attendee,
          changed_by_user_id: 'u1',
          reason: 'motivo',
        }),
      });
    });
  });

  describe('checkAutoReclassification', () => {
    it('retorna false quando a pessoa não existe', async () => {
      const prisma = { client: {} } as unknown as PrismaService;
      const service = new ClassificationService(prisma);
      const tx = txWith();
      (tx as { person: { findUnique: jest.Mock } }).person.findUnique.mockResolvedValue(null);

      await expect(service.checkAutoReclassification('p1', 'u1', tx)).resolves.toBe(false);
    });

    it('retorna false quando a pessoa não é visitante', async () => {
      const prisma = { client: {} } as unknown as PrismaService;
      const service = new ClassificationService(prisma);
      const tx = txWith();
      (tx as { person: { findUnique: jest.Mock } }).person.findUnique.mockResolvedValue({
        classification: PersonClassification.member,
      });

      await expect(service.checkAutoReclassification('p1', 'u1', tx)).resolves.toBe(false);
      expect((tx as { visitRecord: { count: jest.Mock } }).visitRecord.count).not.toHaveBeenCalled();
    });

    it('retorna false quando o visitante tem menos de 3 visitas em 60 dias', async () => {
      const prisma = { client: {} } as unknown as PrismaService;
      const service = new ClassificationService(prisma);
      const tx = txWith();
      (tx as { person: { findUnique: jest.Mock } }).person.findUnique.mockResolvedValue({
        classification: PersonClassification.visitor,
      });
      (tx as { visitRecord: { count: jest.Mock } }).visitRecord.count.mockResolvedValue(2);

      await expect(service.checkAutoReclassification('p1', 'u1', tx)).resolves.toBe(false);
      expect((tx as { person: { update: jest.Mock } }).person.update).not.toHaveBeenCalled();
    });

    it('reclassifica para attendee e retorna true com 3 visitas em 60 dias', async () => {
      const prisma = { client: {} } as unknown as PrismaService;
      const service = new ClassificationService(prisma);
      const tx = txWith();
      (tx as { person: { findUnique: jest.Mock } }).person.findUnique
        .mockResolvedValueOnce({ classification: PersonClassification.visitor })
        .mockResolvedValueOnce({
          id: 'p1',
          classification: PersonClassification.visitor,
          tenant_id: 't1',
          congregation_id: 'c1',
        });
      (tx as { visitRecord: { count: jest.Mock } }).visitRecord.count.mockResolvedValue(3);

      const result = await service.checkAutoReclassification('p1', 'u1', tx);

      expect(result).toBe(true);
      expect((tx as { person: { update: jest.Mock } }).person.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { classification: PersonClassification.attendee },
      });
    });
  });

  describe('manualReclassify (abre a própria transação)', () => {
    it('lança BadRequestException ao promover para membro sem data de membresia', async () => {
      const client = { person: { findUnique: jest.fn().mockResolvedValue({ membership_date: null }) } };
      const prisma = { client, runInTx: jest.fn() } as unknown as PrismaService;
      const service = new ClassificationService(prisma);

      await expect(
        service.manualReclassify('p1', PersonClassification.member, 'motivo', 'u1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect((prisma as unknown as { runInTx: jest.Mock }).runInTx).not.toHaveBeenCalled();
    });

    it('lança NotFoundException ao promover pessoa inexistente para membro', async () => {
      const client = { person: { findUnique: jest.fn().mockResolvedValue(null) } };
      const prisma = { client, runInTx: jest.fn() } as unknown as PrismaService;
      const service = new ClassificationService(prisma);

      await expect(
        service.manualReclassify('nope', PersonClassification.member, 'motivo', 'u1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('promove para membro quando já existe data de membresia', async () => {
      const client = {
        person: { findUnique: jest.fn().mockResolvedValue({ membership_date: new Date('2020-01-01') }) },
      };
      const tx = txWith();
      (tx as { person: { findUnique: jest.Mock } }).person.findUnique.mockResolvedValue({
        id: 'p1',
        classification: PersonClassification.attendee,
        tenant_id: 't1',
        congregation_id: 'c1',
      });
      const runInTx = jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(tx));
      const prisma = { client, runInTx } as unknown as PrismaService;
      const service = new ClassificationService(prisma);

      await service.manualReclassify('p1', PersonClassification.member, 'motivo', 'u1');

      expect(runInTx).toHaveBeenCalledWith(expect.any(Function), { timeout: 30_000, maxWait: 10_000 });
      expect((tx as { person: { update: jest.Mock } }).person.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { classification: PersonClassification.member },
      });
    });

    it('não valida data de membresia para classificações que não são member', async () => {
      const client = { person: { findUnique: jest.fn() } };
      const tx = txWith();
      (tx as { person: { findUnique: jest.Mock } }).person.findUnique.mockResolvedValue({
        id: 'p1',
        classification: PersonClassification.visitor,
        tenant_id: 't1',
        congregation_id: 'c1',
      });
      const runInTx = jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(tx));
      const prisma = { client, runInTx } as unknown as PrismaService;
      const service = new ClassificationService(prisma);

      await service.manualReclassify('p1', PersonClassification.attendee, undefined, 'u1');

      expect(client.person.findUnique).not.toHaveBeenCalled();
      expect(
        (tx as { classificationHistory: { create: jest.Mock } }).classificationHistory.create,
      ).toHaveBeenCalledWith({
        data: expect.objectContaining({ reason: 'Reclassificação manual' }),
      });
    });
  });

  describe('findHistory', () => {
    it('busca o histórico da pessoa ordenado do mais recente', async () => {
      const client = { classificationHistory: { findMany: jest.fn().mockResolvedValue([{ id: 'h1' }]) } };
      const prisma = { client } as unknown as PrismaService;
      const service = new ClassificationService(prisma);

      const result = await service.findHistory('p1');

      expect(client.classificationHistory.findMany).toHaveBeenCalledWith({
        where: { person_id: 'p1' },
        orderBy: { changed_at: 'desc' },
      });
      expect(result).toEqual([{ id: 'h1' }]);
    });
  });
});
