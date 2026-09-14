/**
 * O que este arquivo cobra são as regras que o PROD-16 inventou — prazo,
 * vagas, fila de espera e promoção — e as duas portas (`/me` e a do
 * organizador) chegarem no mesmo lugar. O isolamento entre congregações é do
 * RLS e está em `test/rls/event-registrations.spec.ts`.
 */

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EventRegistrationsService } from './event-registrations.service';
import { PrismaService } from '../prisma/prisma.service';

type Row = Record<string, unknown>;

const EVENT = {
  id: 'p1',
  type: 'event',
  registration_enabled: true,
  registration_limit: null as number | null,
  registration_deadline: null as Date | null,
};

function clientWith(post: Row | null = { ...EVENT }, rows: Row[] = []) {
  const store = [...rows];

  const client = {
    rows: store,
    contentPost: {
      findFirst: jest.fn().mockResolvedValue(post),
    },
    person: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'person-1',
        full_name: 'Maria Membro',
        email: 'maria@igreja.test',
        phone: '11999999999',
      }),
    },
    userAccount: {
      findUnique: jest.fn().mockResolvedValue({ person_id: 'person-1' }),
    },
    eventRegistration: {
      findMany: jest.fn().mockImplementation(() => Promise.resolve(store)),
      findFirst: jest.fn().mockImplementation(({ where, orderBy }: never) => {
        const w = where as Row;
        const matches = store.filter((r) => {
          if (w['id'] !== undefined && r['id'] !== w['id']) return false;
          if (w['person_id'] !== undefined && r['person_id'] !== w['person_id']) return false;
          if (w['status'] !== undefined) {
            const s = w['status'] as string | { in?: string[] };
            if (typeof s === 'string' && r['status'] !== s) return false;
            if (typeof s === 'object' && s.in && !s.in.includes(r['status'] as string)) {
              return false;
            }
          }
          if (w['email'] !== undefined) {
            const e = (w['email'] as { equals?: string }).equals;
            if (String(r['email']).toLowerCase() !== String(e).toLowerCase()) return false;
          }
          return true;
        });
        const sorted = [...matches].sort(
          (a, b) =>
            Number(a['created_at'] ?? 0) - Number(b['created_at'] ?? 0),
        );
        const desc = (orderBy as Row | undefined)?.['created_at'] === 'desc';
        return Promise.resolve((desc ? sorted.reverse() : sorted)[0] ?? null);
      }),
      count: jest.fn().mockImplementation(({ where }: never) => {
        const w = where as Row;
        return Promise.resolve(store.filter((r) => r['status'] === w['status']).length);
      }),
      create: jest.fn().mockImplementation(({ data }: never) => {
        const row = { id: `r${store.length + 1}`, created_at: store.length + 1, ...(data as Row) };
        store.push(row);
        return Promise.resolve(row);
      }),
      update: jest.fn().mockImplementation(({ where, data }: never) => {
        const row = store.find((r) => r['id'] === (where as Row)['id'])!;
        Object.assign(row, data as Row);
        return Promise.resolve(row);
      }),
    },
  };

  return client;
}

function serviceWith(client: ReturnType<typeof clientWith>) {
  const prisma = {
    client,
    runInTx: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(client)),
  } as unknown as PrismaService;
  return new EventRegistrationsService(prisma);
}

const dto = { full_name: 'João Convidado', email: 'joao@ex.com' };

describe('EventRegistrationsService', () => {
  describe('o post tem que ser um evento do escopo', () => {
    it('post inexistente é 404', async () => {
      const service = serviceWith(clientWith(null));

      await expect(service.register('t1', 'g1', 'p1', dto)).rejects.toThrow(NotFoundException);
    });

    it('post que não é evento também é 404, não 400 — para quem chama, o id é de outra coisa', async () => {
      const service = serviceWith(clientWith({ ...EVENT, type: 'notice' }));

      await expect(service.register('t1', 'g1', 'p1', dto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('register', () => {
    it('inscrição fechada no post é recusada', async () => {
      const service = serviceWith(clientWith({ ...EVENT, registration_enabled: false }));

      await expect(service.register('t1', 'g1', 'p1', dto)).rejects.toThrow(BadRequestException);
    });

    it('prazo vencido é recusado', async () => {
      const service = serviceWith(
        clientWith({ ...EVENT, registration_deadline: new Date(Date.now() - 1000) }),
      );

      await expect(service.register('t1', 'g1', 'p1', dto)).rejects.toThrow(BadRequestException);
    });

    it('prazo no futuro passa', async () => {
      const service = serviceWith(
        clientWith({ ...EVENT, registration_deadline: new Date(Date.now() + 60_000) }),
      );

      await expect(service.register('t1', 'g1', 'p1', dto)).resolves.toMatchObject({
        status: 'confirmed',
      });
    });

    it('sem limite, toda inscrição entra confirmada', async () => {
      const client = clientWith();
      const service = serviceWith(client);

      await service.register('t1', 'g1', 'p1', { full_name: 'A', email: 'a@x.com' });
      const segunda = await service.register('t1', 'g1', 'p1', { full_name: 'B', email: 'b@x.com' });

      expect(segunda.status).toBe('confirmed');
    });

    it('com o limite atingido, a inscrição entra na fila em vez de ser recusada', async () => {
      const client = clientWith({ ...EVENT, registration_limit: 1 });
      const service = serviceWith(client);

      const primeira = await service.register('t1', 'g1', 'p1', { full_name: 'A', email: 'a@x.com' });
      const segunda = await service.register('t1', 'g1', 'p1', { full_name: 'B', email: 'b@x.com' });

      expect(primeira.status).toBe('confirmed');
      expect(segunda.status).toBe('waitlisted');
    });

    it('a contagem de vagas é feita dentro da transação, não antes', async () => {
      const client = clientWith({ ...EVENT, registration_limit: 1 });
      const service = serviceWith(client);

      await service.register('t1', 'g1', 'p1', dto);

      const runInTx = (service as unknown as { prisma: { runInTx: jest.Mock } }).prisma.runInTx;
      expect(runInTx).toHaveBeenCalled();
      expect(client.eventRegistration.count).toHaveBeenCalled();
    });

    it('a mesma pessoa duas vezes é conflito', async () => {
      const client = clientWith();
      const service = serviceWith(client);

      await service.register('t1', 'g1', 'p1', { person_id: 'person-1', full_name: 'Maria' });

      await expect(
        service.register('t1', 'g1', 'p1', { person_id: 'person-1', full_name: 'Maria' }),
      ).rejects.toThrow(ConflictException);
    });

    it('o mesmo e-mail duas vezes é conflito, ignorando caixa', async () => {
      const client = clientWith();
      const service = serviceWith(client);

      await service.register('t1', 'g1', 'p1', { full_name: 'João', email: 'joao@ex.com' });

      await expect(
        service.register('t1', 'g1', 'p1', { full_name: 'João', email: 'JOAO@EX.COM' }),
      ).rejects.toThrow(ConflictException);
    });

    it('sem pessoa nem e-mail não há repetição a reconhecer — entra como nova', async () => {
      const client = clientWith();
      const service = serviceWith(client);

      await service.register('t1', 'g1', 'p1', { full_name: 'Sem contato' });
      await expect(
        service.register('t1', 'g1', 'p1', { full_name: 'Sem contato' }),
      ).resolves.toMatchObject({ status: 'confirmed' });
    });

    it('reinscrição depois de cancelar reaproveita a linha, em vez de criar outra', async () => {
      const client = clientWith();
      const service = serviceWith(client);

      const inscricao = await service.register('t1', 'g1', 'p1', {
        person_id: 'person-1',
        full_name: 'Maria',
      });
      await service.cancel('t1', 'g1', 'p1', inscricao.id);

      const denovo = await service.register('t1', 'g1', 'p1', {
        person_id: 'person-1',
        full_name: 'Maria',
      });

      expect(denovo.id).toBe(inscricao.id);
      expect(denovo.status).toBe('confirmed');
      expect(denovo.cancelled_at).toBeNull();
      expect(client.rows).toHaveLength(1);
    });

    it('pessoa de fora do escopo é 404', async () => {
      const client = clientWith();
      client.person.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.register('t1', 'g1', 'p1', { person_id: 'de-outra', full_name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('guarda quem registrou quando é o organizador', async () => {
      const client = clientWith();
      const service = serviceWith(client);

      const row = await service.register('t1', 'g1', 'p1', dto, 'organizador-1');

      expect(row.registered_by_user_id).toBe('organizador-1');
    });
  });

  describe('registerSelf', () => {
    it('usa o nome e o contato do cadastro, não do corpo — e não marca `registered_by`', async () => {
      const client = clientWith();
      const service = serviceWith(client);

      const row = await service.registerSelf('t1', 'g1', 'p1', 'user-1');

      expect(row).toMatchObject({
        person_id: 'person-1',
        full_name: 'Maria Membro',
        email: 'maria@igreja.test',
        registered_by_user_id: null,
      });
    });

    it('conta sem pessoa vinculada é 404', async () => {
      const client = clientWith();
      client.userAccount.findUnique.mockResolvedValue({ person_id: null });
      const service = serviceWith(client);

      await expect(service.registerSelf('t1', 'g1', 'p1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('cancel', () => {
    it('marca como cancelada e carimba a hora', async () => {
      const client = clientWith();
      const service = serviceWith(client);
      const row = await service.register('t1', 'g1', 'p1', dto);

      const cancelada = await service.cancel('t1', 'g1', 'p1', row.id);

      expect(cancelada.status).toBe('cancelled');
      expect(cancelada.cancelled_at).toBeInstanceOf(Date);
    });

    it('cancelar duas vezes é idempotente, não erro', async () => {
      const client = clientWith();
      const service = serviceWith(client);
      const row = await service.register('t1', 'g1', 'p1', dto);

      await service.cancel('t1', 'g1', 'p1', row.id);
      await expect(service.cancel('t1', 'g1', 'p1', row.id)).resolves.toMatchObject({
        status: 'cancelled',
      });
    });

    it('inscrição inexistente é 404', async () => {
      const service = serviceWith(clientWith());

      await expect(service.cancel('t1', 'g1', 'p1', 'nao-existe')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('cancelar confirmada promove a mais antiga da fila', async () => {
      const client = clientWith({ ...EVENT, registration_limit: 1 });
      const service = serviceWith(client);
      const primeira = await service.register('t1', 'g1', 'p1', { full_name: 'A', email: 'a@x.com' });
      const segunda = await service.register('t1', 'g1', 'p1', { full_name: 'B', email: 'b@x.com' });
      const terceira = await service.register('t1', 'g1', 'p1', { full_name: 'C', email: 'c@x.com' });

      await service.cancel('t1', 'g1', 'p1', primeira.id);

      expect(client.rows.find((r) => r['id'] === segunda.id)!['status']).toBe('confirmed');
      // A terceira continua esperando: uma vaga liberada promove uma pessoa.
      expect(client.rows.find((r) => r['id'] === terceira.id)!['status']).toBe('waitlisted');
    });

    it('cancelar quem já estava na fila não promove ninguém — nenhuma vaga foi liberada', async () => {
      const client = clientWith({ ...EVENT, registration_limit: 1 });
      const service = serviceWith(client);
      await service.register('t1', 'g1', 'p1', { full_name: 'A', email: 'a@x.com' });
      const segunda = await service.register('t1', 'g1', 'p1', { full_name: 'B', email: 'b@x.com' });
      const terceira = await service.register('t1', 'g1', 'p1', { full_name: 'C', email: 'c@x.com' });

      await service.cancel('t1', 'g1', 'p1', segunda.id);

      expect(client.rows.find((r) => r['id'] === terceira.id)!['status']).toBe('waitlisted');
    });

    it('sem limite não há fila para promover', async () => {
      const client = clientWith();
      const service = serviceWith(client);
      const row = await service.register('t1', 'g1', 'p1', dto);

      await service.cancel('t1', 'g1', 'p1', row.id);

      expect(client.rows.every((r) => r['status'] !== 'waitlisted')).toBe(true);
    });

    it('o prazo vencido NÃO impede cancelar — segurar a vaga de quem desistiu é pior', async () => {
      const client = clientWith({ ...EVENT, registration_limit: 1 });
      const service = serviceWith(client);
      const row = await service.register('t1', 'g1', 'p1', dto);
      client.contentPost.findFirst.mockResolvedValue({
        ...EVENT,
        registration_limit: 1,
        registration_deadline: new Date(Date.now() - 1000),
      });

      await expect(service.cancel('t1', 'g1', 'p1', row.id)).resolves.toMatchObject({
        status: 'cancelled',
      });
    });
  });

  describe('cancelMine', () => {
    it('cancela a inscrição do próprio usuário', async () => {
      const client = clientWith();
      const service = serviceWith(client);
      await service.registerSelf('t1', 'g1', 'p1', 'user-1');

      const cancelada = await service.cancelMine('t1', 'g1', 'p1', 'user-1');

      expect(cancelada.status).toBe('cancelled');
    });

    it('quem não se inscreveu recebe 404', async () => {
      const service = serviceWith(clientWith());

      await expect(service.cancelMine('t1', 'g1', 'p1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('summary', () => {
    it('conta confirmadas e em espera, e diz quantas vagas sobraram', async () => {
      const client = clientWith({ ...EVENT, registration_limit: 2 });
      const service = serviceWith(client);
      await service.register('t1', 'g1', 'p1', { full_name: 'A', email: 'a@x.com' });
      await service.register('t1', 'g1', 'p1', { full_name: 'B', email: 'b@x.com' });
      await service.register('t1', 'g1', 'p1', { full_name: 'C', email: 'c@x.com' });

      const resumo = await service.summary('t1', 'g1', 'p1');

      expect(resumo).toMatchObject({
        confirmed_count: 2,
        waitlisted_count: 1,
        seats_left: 0,
        registrations_closed: false,
      });
    });

    it('sem limite, `seats_left` é null — não zero', async () => {
      const service = serviceWith(clientWith());

      expect((await service.summary('t1', 'g1', 'p1')).seats_left).toBeNull();
    });

    it('prazo vencido e inscrição desligada fecham, cada um por si', async () => {
      const vencido = serviceWith(
        clientWith({ ...EVENT, registration_deadline: new Date(Date.now() - 1000) }),
      );
      const desligado = serviceWith(clientWith({ ...EVENT, registration_enabled: false }));

      expect((await vencido.summary('t1', 'g1', 'p1')).registrations_closed).toBe(true);
      expect((await desligado.summary('t1', 'g1', 'p1')).registrations_closed).toBe(true);
    });
  });

  describe('list', () => {
    it('sem filtro, traz confirmadas e em espera — não as canceladas', async () => {
      const client = clientWith();
      const service = serviceWith(client);

      await service.list('t1', 'g1', 'p1', {});

      expect(client.eventRegistration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: { in: ['confirmed', 'waitlisted'] } }),
        }),
      );
    });

    it('com filtro, traz só o status pedido', async () => {
      const client = clientWith();
      const service = serviceWith(client);

      await service.list('t1', 'g1', 'p1', { status: 'cancelled' });

      expect(client.eventRegistration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'cancelled' }) }),
      );
    });

    it('a lista vem com o resumo junto — a tela mostra os dois', async () => {
      const service = serviceWith(clientWith());

      const resultado = await service.list('t1', 'g1', 'p1', {});

      expect(resultado).toHaveProperty('data');
      expect(resultado).toHaveProperty('confirmed_count');
    });
  });
});
