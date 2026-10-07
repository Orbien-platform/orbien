import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DreQueryDto } from './dto/dre-query.dto';
import { DreController } from './dre.controller';
import { DreService } from './dre.service';
import { DrePdfService } from './dre-pdf.service';
import { DreCostCenterService } from './dre-cost-center.service';
import { BalanceteQueryDto } from './dto/balancete-query.dto';
import { REQUIRES_PLAN_KEY } from '../auth/decorators/requires-plan.decorator';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const DRE_ROLES = ['treasurer', 'admin_congregation', 'pastor', 'tenant_admin'];

function rolesFor(methodName: keyof DreController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, DreController.prototype[methodName]);
}

function baseUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'user-1',
    tenant_id: 'tenant-1',
    congregation_id: 'cong-1',
    roles: ['treasurer'],
    plan: 'starter',
    ...overrides,
  };
}

describe('DreController', () => {
  let dreService: jest.Mocked<DreService>;
  let drePdfService: jest.Mocked<DrePdfService>;
  let dreCostCenterService: jest.Mocked<DreCostCenterService>;
  let controller: DreController;

  beforeEach(() => {
    dreService = { buildDre: jest.fn() } as unknown as jest.Mocked<DreService>;
    drePdfService = { generatePdf: jest.fn() } as unknown as jest.Mocked<DrePdfService>;
    dreCostCenterService = { build: jest.fn() } as unknown as jest.Mocked<DreCostCenterService>;
    controller = new DreController(dreService, drePdfService, dreCostCenterService);
  });

  describe('getDre', () => {
    it('exige papel de leitura financeira', () => {
      expect(rolesFor('getDre')).toEqual(DRE_ROLES);
    });

    it('isPastor é false para tesoureiro', async () => {
      dreService.buildDre.mockResolvedValue({} as never);
      const query = { period_start: '2026-01-01', period_end: '2026-01-31' };

      await controller.getDre(query as never, baseUser({ roles: ['treasurer'] }));

      expect(dreService.buildDre).toHaveBeenCalledWith('tenant-1', 'cong-1', query, false);
    });

    it('isPastor é false para admin_congregation mesmo com papel pastor também presente', async () => {
      dreService.buildDre.mockResolvedValue({} as never);
      const query = { period_start: '2026-01-01', period_end: '2026-01-31' };

      await controller.getDre(
        query as never,
        baseUser({ roles: ['pastor', 'admin_congregation'] }),
      );

      expect(dreService.buildDre).toHaveBeenCalledWith('tenant-1', 'cong-1', query, false);
    });

    it('isPastor é true para quem só tem o papel pastor', async () => {
      dreService.buildDre.mockResolvedValue({} as never);
      const query = { period_start: '2026-01-01', period_end: '2026-01-31' };

      await controller.getDre(query as never, baseUser({ roles: ['pastor'] }));

      expect(dreService.buildDre).toHaveBeenCalledWith('tenant-1', 'cong-1', query, true);
    });
  });

  it('é Premium — @RequiresPlan no controller inteiro (vale para as rotas novas)', () => {
    expect(new Reflector().get(REQUIRES_PLAN_KEY, DreController)).toBe('premium');
  });

  describe('getByCostCenter', () => {
    it('exige os mesmos papéis do DRE', () => {
      expect(rolesFor('getByCostCenter')).toEqual(DRE_ROLES);
    });

    it('delega ao serviço com o tenant do token e devolve a matriz', async () => {
      const matrix = { columns: [] } as never;
      dreCostCenterService.build.mockResolvedValue(matrix);
      const query = { period_start: '2026-01-01', period_end: '2026-01-31' };

      const result = await controller.getByCostCenter(query as never, baseUser());

      expect(dreCostCenterService.build).toHaveBeenCalledWith('tenant-1', query);
      expect(result).toBe(matrix);
    });

    it('a query é validada pelo BalanceteQueryDto: período invertido → 400', async () => {
      const metatype = (
        Reflect.getMetadata('design:paramtypes', DreController.prototype, 'getByCostCenter') as unknown[]
      )[0];
      expect(metatype).toBe(BalanceteQueryDto);

      const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
      await expect(
        pipe.transform(
          { period_start: '2026-02-01', period_end: '2026-01-31' },
          { type: 'query', metatype: metatype as never },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('exportPdf', () => {
    it('exige papel de leitura financeira', () => {
      expect(rolesFor('exportPdf')).toEqual(DRE_ROLES);
    });

    it('gera o PDF e monta o filename com um único mês', async () => {
      drePdfService.generatePdf.mockResolvedValue(Buffer.from('pdf'));
      const res = { set: jest.fn() };
      const query = { period_start: '2026-01-01', period_end: '2026-01-31' };

      const result = await controller.exportPdf(query as never, baseUser(), res as never);

      expect(drePdfService.generatePdf).toHaveBeenCalledWith('tenant-1', 'cong-1', query);
      expect(res.set).toHaveBeenCalledWith({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="orbien_dre_202601.pdf"',
      });
      expect(result.getStream).toBeDefined();
    });

    it('monta o filename com intervalo quando os meses diferem', async () => {
      drePdfService.generatePdf.mockResolvedValue(Buffer.from('pdf'));
      const res = { set: jest.fn() };
      const query = { period_start: '2026-01-01', period_end: '2026-03-31' };

      await controller.exportPdf(query as never, baseUser(), res as never);

      expect(res.set).toHaveBeenCalledWith({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="orbien_dre_202601_202603.pdf"',
      });
    });

    describe('validação do corpo (400)', () => {
      // Mesma configuração do `main.ts`: o ValidationPipe global é quem
      // responde 400, usando o tipo declarado no @Body da rota.
      const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
      const bodyType = () =>
        (Reflect.getMetadata('design:paramtypes', DreController.prototype, 'exportPdf') as unknown[])[0];

      it('o @Body do export é o DreQueryDto (é ele que o pipe valida)', () => {
        expect(bodyType()).toBe(DreQueryDto);
      });

      it('period_end < period_start → 400', async () => {
        await expect(
          pipe.transform(
            { period_start: '2026-02-01', period_end: '2026-01-31' },
            { type: 'body', metatype: bodyType() as never },
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('cost_center_id inválido → 400', async () => {
        await expect(
          pipe.transform(
            { period_start: '2026-01-01', period_end: '2026-01-31', cost_center_id: 'abc' },
            { type: 'body', metatype: bodyType() as never },
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('período válido com cost_center_id "none" passa', async () => {
        await expect(
          pipe.transform(
            { period_start: '2026-01-01', period_end: '2026-01-31', cost_center_id: 'none' },
            { type: 'body', metatype: bodyType() as never },
          ),
        ).resolves.toMatchObject({ cost_center_id: 'none' });
      });
    });
  });
});
