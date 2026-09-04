import { NotFoundException } from '@nestjs/common';
import { SegmentsService } from './segments.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = {
  sub: 'u1',
  tenant_id: 't1',
  congregation_id: 'g1',
  roles: ['admin_congregation'],
  plan: 'premium',
};

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    audienceSegment: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    ...overrides,
  };
}

function serviceWith(client: ReturnType<typeof clientWith>) {
  const prisma = { client } as unknown as PrismaService;
  return new SegmentsService(prisma);
}

describe('SegmentsService', () => {
  describe('create', () => {
    it('cria o segmento com tenant/congregação do usuário', async () => {
      const client = clientWith();
      client.audienceSegment.create.mockResolvedValue({ id: 'seg1' });
      const service = serviceWith(client);

      const result = await service.create({ name: 'Jovens', criteria: { roles: ['member'] } } as never, USER);

      expect(client.audienceSegment.create).toHaveBeenCalledWith({
        data: {
          name: 'Jovens',
          criteria: { roles: ['member'] },
          tenant_id: 't1',
          congregation_id: 'g1',
        },
      });
      expect(result).toEqual({ id: 'seg1' });
    });
  });

  describe('findAll', () => {
    it('lista apenas segmentos standalone (sem content_post_id)', async () => {
      const client = clientWith();
      client.audienceSegment.findMany.mockResolvedValue([{ id: 'seg1' }]);
      const service = serviceWith(client);

      const result = await service.findAll(USER);

      expect(client.audienceSegment.findMany).toHaveBeenCalledWith({
        where: { tenant_id: 't1', congregation_id: 'g1', content_post_id: { equals: null } },
        orderBy: { created_at: 'asc' },
      });
      expect(result).toEqual([{ id: 'seg1' }]);
    });
  });

  describe('findOne', () => {
    it('retorna o segmento quando encontrado', async () => {
      const client = clientWith();
      client.audienceSegment.findFirst.mockResolvedValue({ id: 'seg1' });
      const service = serviceWith(client);

      expect(await service.findOne('seg1', USER)).toEqual({ id: 'seg1' });
    });

    it('lança NotFoundException quando não encontrado', async () => {
      const client = clientWith();
      client.audienceSegment.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.findOne('seg1', USER)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('atualiza apenas os campos informados', async () => {
      const client = clientWith();
      client.audienceSegment.findFirst.mockResolvedValue({ id: 'seg1' });
      client.audienceSegment.update.mockResolvedValue({ id: 'seg1', name: 'Novo' });
      const service = serviceWith(client);

      await service.update('seg1', { name: 'Novo' } as never, USER);

      expect(client.audienceSegment.update).toHaveBeenCalledWith({
        where: { id: 'seg1' },
        data: { name: 'Novo' },
      });
    });

    it('atualiza criteria quando informado', async () => {
      const client = clientWith();
      client.audienceSegment.findFirst.mockResolvedValue({ id: 'seg1' });
      client.audienceSegment.update.mockResolvedValue({ id: 'seg1' });
      const service = serviceWith(client);

      await service.update('seg1', { criteria: { roles: ['pastor'] } } as never, USER);

      expect(client.audienceSegment.update).toHaveBeenCalledWith({
        where: { id: 'seg1' },
        data: { criteria: { roles: ['pastor'] } },
      });
    });

    it('lança NotFoundException quando o segmento não existe', async () => {
      const client = clientWith();
      client.audienceSegment.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.update('seg1', {} as never, USER)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('remove o segmento quando encontrado', async () => {
      const client = clientWith();
      client.audienceSegment.findFirst.mockResolvedValue({ id: 'seg1' });
      client.audienceSegment.delete.mockResolvedValue({ id: 'seg1' });
      const service = serviceWith(client);

      expect(await service.remove('seg1', USER)).toEqual({ id: 'seg1' });
    });

    it('lança NotFoundException quando não encontrado', async () => {
      const client = clientWith();
      client.audienceSegment.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.remove('seg1', USER)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
