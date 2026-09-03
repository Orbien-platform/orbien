import { Reflector } from '@nestjs/core';
import { VisitorAdminController } from './visitor.admin.controller';
import { VisitorService } from './visitor.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const MANAGE_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'secretary'];

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['secretary'],
  plan: 'starter',
};

function rolesFor(methodName: keyof VisitorAdminController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, VisitorAdminController.prototype[methodName]);
}

describe('VisitorAdminController', () => {
  let visitorService: jest.Mocked<VisitorService>;
  let controller: VisitorAdminController;

  beforeEach(() => {
    visitorService = {
      createQrToken: jest.fn(),
      listQrTokens: jest.fn(),
      toggleQrToken: jest.fn(),
    } as unknown as jest.Mocked<VisitorService>;
    controller = new VisitorAdminController(visitorService);
  });

  it('create delega ao service com dto e usuário, e exige papel de gestão', async () => {
    visitorService.createQrToken.mockResolvedValue({ id: 'qr1' } as never);
    const dto = { origin: 'service' } as never;

    const result = await controller.create(dto, user);

    expect(visitorService.createQrToken).toHaveBeenCalledWith(dto, user);
    expect(result).toEqual({ id: 'qr1' });
    expect(rolesFor('create')).toEqual(MANAGE_ROLES);
  });

  it('findAll delega ao service com o usuário, e exige papel de gestão', async () => {
    visitorService.listQrTokens.mockResolvedValue([{ id: 'qr1' }] as never);

    const result = await controller.findAll(user);

    expect(visitorService.listQrTokens).toHaveBeenCalledWith(user);
    expect(result).toEqual([{ id: 'qr1' }]);
    expect(rolesFor('findAll')).toEqual(MANAGE_ROLES);
  });

  it('toggle delega ao service com id e usuário, e exige papel de gestão', async () => {
    visitorService.toggleQrToken.mockResolvedValue({ id: 'qr1', is_active: false } as never);

    const result = await controller.toggle('qr1', user);

    expect(visitorService.toggleQrToken).toHaveBeenCalledWith('qr1', user);
    expect(result).toEqual({ id: 'qr1', is_active: false });
    expect(rolesFor('toggle')).toEqual(MANAGE_ROLES);
  });
});
