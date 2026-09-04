import { Reflector } from '@nestjs/core';
import { DreController } from './dre.controller';
import { DreService } from './dre.service';
import { DrePdfService } from './dre-pdf.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const DRE_ROLES = ['tesoureiro', 'admin_congregation', 'pastor', 'tenant_admin'];

function rolesFor(methodName: keyof DreController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, DreController.prototype[methodName]);
}

function baseUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'user-1',
    tenant_id: 'tenant-1',
    congregation_id: 'cong-1',
    roles: ['tesoureiro'],
    plan: 'starter',
    ...overrides,
  };
}

describe('DreController', () => {
  let dreService: jest.Mocked<DreService>;
  let drePdfService: jest.Mocked<DrePdfService>;
  let controller: DreController;

  beforeEach(() => {
    dreService = { buildDre: jest.fn() } as unknown as jest.Mocked<DreService>;
    drePdfService = { generatePdf: jest.fn() } as unknown as jest.Mocked<DrePdfService>;
    controller = new DreController(dreService, drePdfService);
  });

  describe('getDre', () => {
    it('exige papel de leitura financeira', () => {
      expect(rolesFor('getDre')).toEqual(DRE_ROLES);
    });

    it('isPastor é false para tesoureiro', async () => {
      dreService.buildDre.mockResolvedValue({} as never);
      const query = { period_start: '2026-01-01', period_end: '2026-01-31' };

      await controller.getDre(query as never, baseUser({ roles: ['tesoureiro'] }));

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
  });
});
