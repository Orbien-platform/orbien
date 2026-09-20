import { Reflector } from '@nestjs/core';
import { OfxImportController } from './ofx-import.controller';
import { OfxImportService } from './ofx-import.service';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { REQUIRES_PLAN_KEY } from '../../auth/decorators/requires-plan.decorator';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

const IMPORT_ROLES = ['treasurer', 'admin_congregation', 'tenant_admin'];

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['treasurer'],
  plan: 'premium',
};

function rolesFor(methodName: keyof OfxImportController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, OfxImportController.prototype[methodName]);
}

describe('OfxImportController', () => {
  let ofxImportService: jest.Mocked<OfxImportService>;
  let controller: OfxImportController;

  beforeEach(() => {
    ofxImportService = {
      importOfx: jest.fn(),
      findUnmatched: jest.fn(),
    } as unknown as jest.Mocked<OfxImportService>;

    controller = new OfxImportController(ofxImportService);
  });

  it('a rota inteira exige o plano Premium', () => {
    const reflector = new Reflector();
    expect(reflector.get<string | undefined>(REQUIRES_PLAN_KEY, OfxImportController)).toBe('premium');
  });

  it('importOfx delega ao service e exige papel financeiro', async () => {
    const file = { originalname: 'extrato.ofx' } as Express.Multer.File;
    ofxImportService.importOfx.mockResolvedValue({
      job_id: 'job-1',
      total: 1,
      matched: 1,
      unmatched: 0,
      duplicates: 0,
      errors: [],
    });

    const result = await controller.importOfx(file, user);

    expect(ofxImportService.importOfx).toHaveBeenCalledWith(file, user);
    expect(result.job_id).toBe('job-1');
    expect(rolesFor('importOfx')).toEqual(IMPORT_ROLES);
  });

  it('findUnmatched delega ao service e exige papel financeiro', async () => {
    ofxImportService.findUnmatched.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 } as never);

    const result = await controller.findUnmatched({ page: 1, limit: 20 }, user);

    expect(ofxImportService.findUnmatched).toHaveBeenCalledWith({ page: 1, limit: 20 }, user);
    expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
    expect(rolesFor('findUnmatched')).toEqual(IMPORT_ROLES);
  });
});
