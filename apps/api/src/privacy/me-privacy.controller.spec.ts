import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { MePrivacyController } from './me-privacy.controller';
import { MePrivacyService } from './me-privacy.service';

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['member'],
  plan: 'starter',
};

describe('MePrivacyController', () => {
  const privacy = {
    personalData: jest.fn().mockResolvedValue('personal'),
    exportData: jest.fn().mockResolvedValue('export'),
    updateMyData: jest.fn().mockResolvedValue('updated'),
    revokeConsent: jest.fn().mockResolvedValue({ revoked: 1 }),
    requestDeletion: jest.fn().mockResolvedValue('requested'),
    cancelDeletion: jest.fn().mockResolvedValue('cancelled'),
  };
  const controller = new MePrivacyController(privacy as unknown as MePrivacyService);

  it('repassa cada rota ao serviço com o usuário do token', async () => {
    await expect(controller.personalData(user)).resolves.toBe('personal');
    await expect(controller.exportData(user)).resolves.toBe('export');
    await expect(controller.update({ phone: '1' }, user)).resolves.toBe('updated');
    await expect(controller.revokeConsent({ version: 'v1' }, user)).resolves.toEqual({ revoked: 1 });
    await expect(controller.requestDeletion(user)).resolves.toBe('requested');
    await expect(controller.cancelDeletion(user)).resolves.toBe('cancelled');

    expect(privacy.personalData).toHaveBeenCalledWith(user);
    expect(privacy.updateMyData).toHaveBeenCalledWith({ phone: '1' }, user);
    expect(privacy.revokeConsent).toHaveBeenCalledWith('v1', user);
  });
});
