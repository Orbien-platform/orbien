import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PublicSmallGroupsService } from './public-small-groups.service';
import { PrismaService } from '../prisma/prisma.service';

const TENANT = { id: 't1', name: 'Igreja Central', is_active: true };

const GROUP_ROW = {
  id: 'sg1',
  name: 'Célula Jardim',
  public_description: 'Toda quinta, com café',
  public_photo_url: null,
  address: 'Rua A, 100',
  lat: new Prisma.Decimal('-23.5505199'),
  lng: new Prisma.Decimal('-46.6333094'),
  meeting_time: '19:30',
  recurrence: 'weekly',
  groupType: { id: 'gt1', name: 'Célula', color: '#123456' },
  congregation: { id: 'c1', name: 'Sede' },
};

type TxMock = {
  $executeRaw: jest.Mock;
  smallGroup: { findMany: jest.Mock; findFirst: jest.Mock };
};

function makeTx(): TxMock {
  return {
    $executeRaw: jest.fn(),
    smallGroup: {
      findMany: jest.fn().mockResolvedValue([GROUP_ROW]),
      findFirst: jest.fn().mockResolvedValue({ id: 'sg1', congregation_id: 'c1' }),
    },
  };
}

// O insert do pedido é `$executeRaw` (o `create` do Prisma usa RETURNING, que
// o plano público não pode ler — ver o comentário no serviço). Como é template
// tagueado, os valores chegam como argumentos depois do array de literais.
function insertCall(tx: TxMock) {
  const call = tx.$executeRaw.mock.calls.find((c) =>
    (c[0] as string[]).join('').includes('INSERT INTO small_group_visit_requests'),
  );
  if (!call) return null;
  const [, ...values] = call as unknown[];
  return values;
}

function serviceWith(tx: TxMock, tenant: unknown = TENANT, brandingAppName: string | null = null) {
  const prisma = {
    client: {
      tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
      brandingConfig: {
        findUnique: jest.fn().mockResolvedValue(
          brandingAppName === null ? null : { app_name: brandingAppName },
        ),
      },
    },
    runInTx: jest.fn(async (fn: (t: TxMock) => Promise<unknown>) => fn(tx)),
  };
  return {
    service: new PublicSmallGroupsService(prisma as unknown as PrismaService),
    prisma,
  };
}

describe('PublicSmallGroupsService', () => {
  describe('findPublic', () => {
    it('fixa o tenant resolvido pelo slug antes de ler — o contexto de RLS não vem do cliente', async () => {
      const tx = makeTx();
      const { service } = serviceWith(tx);

      await service.findPublic({ tenant_slug: 'central' });

      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      const [, boundTenantId] = tx.$executeRaw.mock.calls[0] as unknown[];
      expect(boundTenantId).toBe('t1');
    });

    it('filtra por is_public além da policy — WHERE e RLS dizem a mesma coisa', async () => {
      const tx = makeTx();
      const { service } = serviceWith(tx);

      await service.findPublic({ tenant_slug: 'central' });

      expect(tx.smallGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenant_id: 't1', is_public: true } }),
      );
    });

    it('não expõe líder nem contato da célula', async () => {
      const tx = makeTx();
      const { service } = serviceWith(tx);

      const result = await service.findPublic({ tenant_slug: 'central' });

      expect(JSON.stringify(result)).not.toContain('leader');
      expect(Object.keys(result.groups[0])).toEqual([
        'id',
        'name',
        'description',
        'photo_url',
        'address',
        'lat',
        'lng',
        'meeting_time',
        'recurrence',
        'group_type',
        'congregation',
      ]);
    });

    it('converte lat/lng de Decimal para número — o JSON do Prisma sairia como string', async () => {
      const tx = makeTx();
      const { service } = serviceWith(tx);

      const { groups } = await service.findPublic({ tenant_slug: 'central' });

      expect(groups[0].lat).toBeCloseTo(-23.5505199);
      expect(groups[0].lng).toBeCloseTo(-46.6333094);
    });

    it('mantém lat/lng nulos quando a célula não tem coordenada', async () => {
      const tx = makeTx();
      tx.smallGroup.findMany.mockResolvedValue([{ ...GROUP_ROW, lat: null, lng: null }]);
      const { service } = serviceWith(tx);

      const { groups } = await service.findPublic({ tenant_slug: 'central' });

      expect(groups[0].lat).toBeNull();
      expect(groups[0].lng).toBeNull();
    });

    it('usa o app_name do branding como nome da igreja quando existe', async () => {
      const tx = makeTx();
      const { service } = serviceWith(tx, TENANT, 'Central Church');

      const result = await service.findPublic({ tenant_slug: 'central' });

      expect(result.church_name).toBe('Central Church');
    });

    it('cai no nome do tenant quando não há branding', async () => {
      const tx = makeTx();
      const { service } = serviceWith(tx);

      const result = await service.findPublic({ tenant_slug: 'central' });

      expect(result.church_name).toBe('Igreja Central');
    });

    it('404 para slug inexistente', async () => {
      const tx = makeTx();
      const { service } = serviceWith(tx, null);

      await expect(service.findPublic({ tenant_slug: 'nao-existe' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('404 para tenant desativado — igreja fora do ar não aparece em página pública', async () => {
      const tx = makeTx();
      const { service } = serviceWith(tx, { ...TENANT, is_active: false });

      await expect(service.findPublic({ tenant_slug: 'central' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('requestVisit', () => {
    const DTO = {
      tenant_slug: 'central',
      visitor_name: 'Maria Silva',
      visitor_phone: '11999990000',
    };

    it('grava o pedido na congregação DA CÉLULA, não numa mandada pelo cliente', async () => {
      const tx = makeTx();
      const { service } = serviceWith(tx);

      await service.requestVisit('sg1', DTO);

      expect(insertCall(tx)).toEqual(['t1', 'c1', 'sg1', 'Maria Silva', '11999990000', null, null]);
    });

    it('guarda a mensagem do visitante, sem espaço em volta', async () => {
      const tx = makeTx();
      const { service } = serviceWith(tx);

      await service.requestVisit('sg1', { ...DTO, message: '  posso levar meu filho?  ' });

      expect(insertCall(tx)![6]).toBe('posso levar meu filho?');
    });

    it('fixa tenant e depois a congregação da célula no contexto, nessa ordem', async () => {
      const tx = makeTx();
      const { service } = serviceWith(tx);

      await service.requestVisit('sg1', DTO);

      expect(tx.$executeRaw.mock.calls[0][1]).toBe('t1');
      expect(tx.$executeRaw.mock.calls[1][1]).toBe('c1');
      expect(tx.$executeRaw.mock.calls[1][0].join('')).toContain('app.congregation_id');
    });

    it('só enxerga célula pública do tenant resolvido', async () => {
      const tx = makeTx();
      const { service } = serviceWith(tx);

      await service.requestVisit('sg1', DTO);

      expect(tx.smallGroup.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sg1', tenant_id: 't1', is_public: true },
        }),
      );
    });

    it('404 quando a célula não é pública (ou é de outro tenant)', async () => {
      const tx = makeTx();
      tx.smallGroup.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(tx);

      await expect(service.requestVisit('sg1', DTO)).rejects.toBeInstanceOf(NotFoundException);
      expect(insertCall(tx)).toBeNull();
    });

    it('exige ao menos um contato — nome sozinho não dá para responder', async () => {
      const tx = makeTx();
      const { service } = serviceWith(tx);

      await expect(
        service.requestVisit('sg1', { tenant_slug: 'central', visitor_name: 'Maria' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(insertCall(tx)).toBeNull();
    });

    it('trata contato só com espaços como ausente', async () => {
      const tx = makeTx();
      const { service } = serviceWith(tx);

      await expect(
        service.requestVisit('sg1', {
          tenant_slug: 'central',
          visitor_name: 'Maria',
          visitor_phone: '   ',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('aceita só e-mail como contato', async () => {
      const tx = makeTx();
      const { service } = serviceWith(tx);

      await service.requestVisit('sg1', {
        tenant_slug: 'central',
        visitor_name: 'Maria',
        visitor_email: 'maria@exemplo.com',
      });

      const values = insertCall(tx)!;
      expect(values[4]).toBeNull();
      expect(values[5]).toBe('maria@exemplo.com');
    });

    it('honeypot preenchido responde sucesso e não grava nada', async () => {
      const tx = makeTx();
      const { service, prisma } = serviceWith(tx);

      const result = await service.requestVisit('sg1', { ...DTO, website: 'http://spam' });

      expect(result.status).toBe('received');
      expect(prisma.runInTx).not.toHaveBeenCalled();
      expect(insertCall(tx)).toBeNull();
    });

    it('404 para slug inexistente', async () => {
      const tx = makeTx();
      const { service } = serviceWith(tx, null);

      await expect(service.requestVisit('sg1', DTO)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
