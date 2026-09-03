import { NotFoundException } from '@nestjs/common';
import { Prisma, WaitlistStatus } from '@prisma/client';
import { WaitlistService } from './waitlist.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWaitlistDto } from './dto/create-waitlist.dto';

function serviceWith() {
  const waitlistSubscriberClient = {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  const prisma = { client: { waitlistSubscriber: waitlistSubscriberClient } } as unknown as PrismaService;
  return { service: new WaitlistService(prisma), client: waitlistSubscriberClient };
}

const dto = {
  email: 'pastor@igreja.test',
  pastor_name: 'Pastor João',
  church_name: 'Igreja Teste',
  city: 'São Paulo',
  state: 'SP',
  size_range: 'ate_150',
  lgpd_consent: true,
  source: 'landing',
  utm_source: 'google',
  utm_medium: 'cpc',
  utm_campaign: 'lancamento',
} as CreateWaitlistDto;

describe('WaitlistService', () => {
  describe('subscribe', () => {
    it('cadastra o interessado com ip e user-agent', async () => {
      const { service, client } = serviceWith();
      client.create.mockResolvedValue({});

      const result = await service.subscribe(dto, '1.2.3.4', 'ua-test');

      expect(client.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: dto.email,
          pastor_name: dto.pastor_name,
          ip: '1.2.3.4',
          user_agent: 'ua-test',
        }),
      });
      expect(result).toEqual({ success: true });
    });

    it('email duplicado retorna success sem vazar informação (P2002)', async () => {
      const { service, client } = serviceWith();
      client.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '6.0.0' }),
      );

      await expect(service.subscribe(dto, '1.2.3.4', 'ua')).resolves.toEqual({ success: true });
    });

    it('propaga erros que não são P2002', async () => {
      const { service, client } = serviceWith();
      const boom = new Error('conexão caiu');
      client.create.mockRejectedValue(boom);

      await expect(service.subscribe(dto, '1.2.3.4', 'ua')).rejects.toBe(boom);
    });
  });

  describe('findAll', () => {
    it('usa defaults de página/limite e where vazio sem filtros', async () => {
      const { service, client } = serviceWith();
      client.findMany.mockResolvedValue([{ id: 's1' }]);
      client.count.mockResolvedValue(1);

      const result = await service.findAll({} as never);

      expect(client.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { created_at: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({ data: [{ id: 's1' }], total: 1, page: 1, limit: 20 });
    });

    it('aplica status, size_range e source, e pagina', async () => {
      const { service, client } = serviceWith();
      client.findMany.mockResolvedValue([]);
      client.count.mockResolvedValue(0);

      await service.findAll({
        status: WaitlistStatus.contacted,
        size_range: 'ate_150',
        source: 'landing',
        page: 3,
        limit: 10,
      } as never);

      expect(client.findMany).toHaveBeenCalledWith({
        where: { status: WaitlistStatus.contacted, size_range: 'ate_150', source: 'landing' },
        orderBy: { created_at: 'desc' },
        skip: 20,
        take: 10,
      });
    });
  });

  describe('findOne', () => {
    it('lança NotFoundException quando não existe', async () => {
      const { service, client } = serviceWith();
      client.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('retorna o inscrito quando existe', async () => {
      const { service, client } = serviceWith();
      client.findUnique.mockResolvedValue({ id: 's1' });

      await expect(service.findOne('s1')).resolves.toEqual({ id: 's1' });
    });
  });

  describe('update', () => {
    it('lança NotFoundException quando o inscrito não existe', async () => {
      const { service, client } = serviceWith();
      client.findUnique.mockResolvedValue(null);

      await expect(service.update('nope', {} as never)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('marca contacted_at automaticamente ao mudar status para contacted, se ainda não houver', async () => {
      const { service, client } = serviceWith();
      client.findUnique
        .mockResolvedValueOnce({ id: 's1' }) // findOne (existence check)
        .mockResolvedValueOnce({ contacted_at: null }); // busca contacted_at atual
      client.update.mockResolvedValue({ id: 's1', status: WaitlistStatus.contacted });

      await service.update('s1', { status: WaitlistStatus.contacted } as never);

      const call = client.update.mock.calls[0][0] as { data: { contacted_at?: Date } };
      expect(call.data.contacted_at).toBeInstanceOf(Date);
    });

    it('não sobrescreve contacted_at já existente', async () => {
      const { service, client } = serviceWith();
      const existing = new Date('2026-01-01');
      client.findUnique
        .mockResolvedValueOnce({ id: 's1' })
        .mockResolvedValueOnce({ contacted_at: existing });
      client.update.mockResolvedValue({ id: 's1' });

      await service.update('s1', { status: WaitlistStatus.contacted } as never);

      const call = client.update.mock.calls[0][0] as { data: { contacted_at?: Date } };
      expect(call.data.contacted_at).toBeUndefined();
    });

    it('não mexe em contacted_at quando o dto já traz o campo', async () => {
      const { service, client } = serviceWith();
      client.findUnique.mockResolvedValueOnce({ id: 's1' });
      client.update.mockResolvedValue({ id: 's1' });

      await service.update('s1', {
        status: WaitlistStatus.contacted,
        contacted_at: '2026-02-01',
      } as never);

      expect(client.findUnique).toHaveBeenCalledTimes(1);
    });

    it('marca activated_at automaticamente ao mudar status para activated, se ainda não houver', async () => {
      const { service, client } = serviceWith();
      client.findUnique
        .mockResolvedValueOnce({ id: 's1' })
        .mockResolvedValueOnce({ activated_at: null });
      client.update.mockResolvedValue({ id: 's1' });

      await service.update('s1', { status: WaitlistStatus.activated } as never);

      const call = client.update.mock.calls[0][0] as { data: { activated_at?: Date } };
      expect(call.data.activated_at).toBeInstanceOf(Date);
    });

    it('não sobrescreve activated_at já existente', async () => {
      const { service, client } = serviceWith();
      const existing = new Date('2026-01-01');
      client.findUnique
        .mockResolvedValueOnce({ id: 's1' })
        .mockResolvedValueOnce({ activated_at: existing });
      client.update.mockResolvedValue({ id: 's1' });

      await service.update('s1', { status: WaitlistStatus.activated } as never);

      const call = client.update.mock.calls[0][0] as { data: { activated_at?: Date } };
      expect(call.data.activated_at).toBeUndefined();
    });

    it('atualização sem mudança de status para contacted/activated não consulta o registro de novo', async () => {
      const { service, client } = serviceWith();
      client.findUnique.mockResolvedValueOnce({ id: 's1' });
      client.update.mockResolvedValue({ id: 's1', notes: 'obs' });

      await service.update('s1', { notes: 'obs' } as never);

      expect(client.findUnique).toHaveBeenCalledTimes(1);
      expect(client.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { notes: 'obs' } });
    });
  });
});
