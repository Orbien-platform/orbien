import { Reflector } from '@nestjs/core';
import { ServiceOrdersController } from './service-orders.controller';
import { ServiceOrdersService } from './service-orders.service';
import { PdfExportService } from './pdf-export.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const MANAGER_ROLES = ['admin_congregation', 'pastor', 'tenant_admin'];

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['pastor'],
  plan: 'starter',
};

function rolesFor(methodName: keyof ServiceOrdersController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, ServiceOrdersController.prototype[methodName]);
}

describe('ServiceOrdersController', () => {
  let serviceOrdersService: jest.Mocked<ServiceOrdersService>;
  let pdfExportService: jest.Mocked<PdfExportService>;
  let controller: ServiceOrdersController;

  beforeEach(() => {
    serviceOrdersService = {
      create: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      publish: jest.fn(),
      finalize: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrdersService>;

    pdfExportService = {
      generateServiceOrderPdf: jest.fn(),
    } as unknown as jest.Mocked<PdfExportService>;

    controller = new ServiceOrdersController(serviceOrdersService, pdfExportService);
  });

  it('create delega ao service e exige papel de gestor', async () => {
    serviceOrdersService.create.mockResolvedValue({ id: 'so1' } as never);

    const result = await controller.create({ title: 'OC' } as never, user);

    expect(serviceOrdersService.create).toHaveBeenCalledWith('tenant-1', 'cong-1', { title: 'OC' });
    expect(result).toEqual({ id: 'so1' });
    expect(rolesFor('create')).toEqual(MANAGER_ROLES);
  });

  it('findOne delega ao service e amplia os papéis de leitura', async () => {
    serviceOrdersService.findOne.mockResolvedValue({ id: 'so1' } as never);

    const result = await controller.findOne('so1', user);

    expect(serviceOrdersService.findOne).toHaveBeenCalledWith('tenant-1', 'cong-1', 'so1');
    expect(result).toEqual({ id: 'so1' });
    expect(rolesFor('findOne')).toEqual([...MANAGER_ROLES, 'ministry_leader', 'volunteer', 'member']);
  });

  it('update delega ao service e exige papel de gestor', async () => {
    serviceOrdersService.update.mockResolvedValue({ id: 'so1' } as never);

    const result = await controller.update('so1', { title: 'Novo' } as never, user);

    expect(serviceOrdersService.update).toHaveBeenCalledWith('tenant-1', 'cong-1', 'so1', {
      title: 'Novo',
    });
    expect(result).toEqual({ id: 'so1' });
    expect(rolesFor('update')).toEqual(MANAGER_ROLES);
  });

  it('publish delega ao service e exige papel de gestor', async () => {
    serviceOrdersService.publish.mockResolvedValue({ id: 'so1' } as never);

    const result = await controller.publish('so1', user);

    expect(serviceOrdersService.publish).toHaveBeenCalledWith('tenant-1', 'cong-1', 'so1');
    expect(result).toEqual({ id: 'so1' });
    expect(rolesFor('publish')).toEqual(MANAGER_ROLES);
  });

  it('finalize delega ao service e exige papel de gestor', async () => {
    serviceOrdersService.finalize.mockResolvedValue({ id: 'so1' } as never);

    const result = await controller.finalize('so1', user);

    expect(serviceOrdersService.finalize).toHaveBeenCalledWith('tenant-1', 'cong-1', 'so1');
    expect(result).toEqual({ id: 'so1' });
    expect(rolesFor('finalize')).toEqual(MANAGER_ROLES);
  });

  it('generatePdf delega ao pdfExportService e amplia os papéis', async () => {
    pdfExportService.generateServiceOrderPdf.mockResolvedValue({
      pdf_url: 'https://x/y.pdf',
      expires_at: '2026-09-07T00:00:00.000Z',
    });

    const result = await controller.generatePdf('so1', user);

    expect(pdfExportService.generateServiceOrderPdf).toHaveBeenCalledWith('tenant-1', 'cong-1', 'so1');
    expect(result).toEqual({ pdf_url: 'https://x/y.pdf', expires_at: '2026-09-07T00:00:00.000Z' });
    expect(rolesFor('generatePdf')).toEqual([...MANAGER_ROLES, 'ministry_leader', 'secretary']);
  });
});
