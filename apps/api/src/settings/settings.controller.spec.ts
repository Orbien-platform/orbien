import { Reflector } from '@nestjs/core';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = {
  sub: 'u1',
  tenant_id: 't1',
  congregation_id: 'g1',
  roles: ['tenant_admin'],
  plan: 'premium',
};

const WRITE_ROLES = ['tenant_admin', 'admin_congregation'];

function rolesFor(methodName: keyof SettingsController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, SettingsController.prototype[methodName]);
}

describe('SettingsController', () => {
  let service: jest.Mocked<SettingsService>;
  let controller: SettingsController;

  beforeEach(() => {
    service = {
      getSettings: jest.fn(),
      updateSettings: jest.fn(),
      uploadLogo: jest.fn(),
    } as unknown as jest.Mocked<SettingsService>;

    controller = new SettingsController(service);
  });

  it('getSettings não declara @Roles (liberado para qualquer usuário autenticado)', () => {
    expect(rolesFor('getSettings')).toBeUndefined();
  });

  it('updateSettings e uploadLogo exigem papel de escrita', () => {
    expect(rolesFor('updateSettings')).toEqual(WRITE_ROLES);
    expect(rolesFor('uploadLogo')).toEqual(WRITE_ROLES);
  });

  it('getSettings delega ao service', async () => {
    service.getSettings.mockResolvedValue({ tenant: {} } as never);

    const result = await controller.getSettings(USER);

    expect(service.getSettings).toHaveBeenCalledWith('t1', 'g1');
    expect(result).toEqual({ tenant: {} });
  });

  it('updateSettings delega ao service', async () => {
    service.updateSettings.mockResolvedValue({ tenant: {} } as never);

    const result = await controller.updateSettings({ tenant: { name: 'Novo' } } as never, USER);

    expect(service.updateSettings).toHaveBeenCalledWith('t1', 'g1', ['tenant_admin'], {
      tenant: { name: 'Novo' },
    });
    expect(result).toEqual({ tenant: {} });
  });

  it('uploadLogo delega ao service', async () => {
    service.uploadLogo.mockResolvedValue({ logo_url: 'https://cdn/a.png' });
    const file = { mimetype: 'image/png' } as Express.Multer.File;

    const result = await controller.uploadLogo(file, USER);

    expect(service.uploadLogo).toHaveBeenCalledWith('t1', 'g1', file);
    expect(result).toEqual({ logo_url: 'https://cdn/a.png' });
  });
});
