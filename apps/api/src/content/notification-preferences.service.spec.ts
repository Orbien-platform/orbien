import { NotificationPreferencesService } from './notification-preferences.service';
import { PrismaService } from '../prisma/prisma.service';

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    notificationPreference: { findUnique: jest.fn(), upsert: jest.fn() },
    ...overrides,
  };
}

function serviceWith(client: ReturnType<typeof clientWith>) {
  const prisma = { client } as unknown as PrismaService;
  return new NotificationPreferencesService(prisma);
}

describe('NotificationPreferencesService', () => {
  describe('get', () => {
    it('sem linha existente, devolve as 4 categorias como true sem criar registro (AC1)', async () => {
      const client = clientWith();
      client.notificationPreference.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      const result = await service.get('user-1');

      expect(result).toEqual({ avisos: true, oracao: true, eventos: true, devocional: true });
      expect(client.notificationPreference.upsert).not.toHaveBeenCalled();
    });

    it('com linha existente, devolve os valores salvos (categoria desligada permanece desligada)', async () => {
      const client = clientWith();
      client.notificationPreference.findUnique.mockResolvedValue({
        id: 'pref-1',
        tenant_id: 't1',
        congregation_id: 'g1',
        user_account_id: 'user-1',
        avisos: true,
        oracao: false,
        eventos: true,
        devocional: true,
      });
      const service = serviceWith(client);

      const result = await service.get('user-1');

      expect(result).toEqual({ avisos: true, oracao: false, eventos: true, devocional: true });
    });

    it('consulta pelo user_account_id recebido', async () => {
      const client = clientWith();
      client.notificationPreference.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await service.get('user-42');

      expect(client.notificationPreference.findUnique).toHaveBeenCalledWith({
        where: { user_account_id: 'user-42' },
      });
    });
  });

  describe('update', () => {
    it('cria a linha na primeira chamada com os defaults + o patch (upsert.create)', async () => {
      const client = clientWith();
      client.notificationPreference.upsert.mockResolvedValue({
        id: 'pref-1',
        tenant_id: 't1',
        congregation_id: 'g1',
        user_account_id: 'user-1',
        avisos: true,
        oracao: false,
        eventos: true,
        devocional: true,
      });
      const service = serviceWith(client);

      await service.update('user-1', 't1', 'g1', { oracao: false });

      expect(client.notificationPreference.upsert).toHaveBeenCalledWith({
        where: { user_account_id: 'user-1' },
        create: {
          tenant_id: 't1',
          congregation_id: 'g1',
          user_account_id: 'user-1',
          avisos: true,
          oracao: false,
          eventos: true,
          devocional: true,
        },
        update: { oracao: false },
      });
    });

    it('atualiza só os campos do patch, preservando os demais (upsert.update)', async () => {
      const client = clientWith();
      client.notificationPreference.upsert.mockResolvedValue({
        id: 'pref-1',
        tenant_id: 't1',
        congregation_id: 'g1',
        user_account_id: 'user-1',
        avisos: false,
        oracao: true,
        eventos: true,
        devocional: true,
      });
      const service = serviceWith(client);

      const result = await service.update('user-1', 't1', 'g1', { avisos: false });

      expect(client.notificationPreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { avisos: false } }),
      );
      expect(result).toEqual({ avisos: false, oracao: true, eventos: true, devocional: true });
    });
  });
});
