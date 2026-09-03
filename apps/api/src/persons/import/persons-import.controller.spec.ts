import { Reflector } from '@nestjs/core';
import { PersonsImportController } from './persons-import.controller';
import { PersonsImportService } from './persons-import.service';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

const IMPORT_ROLES = ['admin_congregation', 'tenant_admin', 'secretary'];

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['secretary'],
  plan: 'starter',
};

function rolesFor(methodName: keyof PersonsImportController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, PersonsImportController.prototype[methodName]);
}

describe('PersonsImportController', () => {
  let importService: jest.Mocked<PersonsImportService>;
  let controller: PersonsImportController;

  beforeEach(() => {
    importService = {
      preview: jest.fn(),
      confirm: jest.fn(),
      findJob: jest.fn(),
    } as unknown as jest.Mocked<PersonsImportService>;
    controller = new PersonsImportController(importService);
  });

  it('uploadPreview delega o arquivo e o tenant do usuário, e exige papel de importação', async () => {
    importService.preview.mockResolvedValue({
      file_id: 'f1.csv',
      total_rows: 1,
      preview_rows: [],
      detected_columns: [],
      suggested_mapping: {},
    });
    const file = { originalname: 'a.csv' } as Express.Multer.File;

    const result = await controller.uploadPreview(file, user);

    expect(importService.preview).toHaveBeenCalledWith(file, 'tenant-1');
    expect(result.file_id).toBe('f1.csv');
    expect(rolesFor('uploadPreview')).toEqual(IMPORT_ROLES);
  });

  it('confirmImport delega dto e usuário, e exige papel de importação', async () => {
    importService.confirm.mockResolvedValue({ imported: 1, skipped: 0, errors: [] });
    const dto = { file_id: 'f1.csv', mapping: { nome: 'nome' } };

    const result = await controller.confirmImport(dto, user);

    expect(importService.confirm).toHaveBeenCalledWith(dto, user);
    expect(result).toEqual({ imported: 1, skipped: 0, errors: [] });
    expect(rolesFor('confirmImport')).toEqual(IMPORT_ROLES);
  });

  it('findJob delega tenant/congregação do usuário e o id, e exige papel de importação', async () => {
    importService.findJob.mockResolvedValue({ id: 'job-1' } as never);

    const result = await controller.findJob('job-1', user);

    expect(importService.findJob).toHaveBeenCalledWith('tenant-1', 'cong-1', 'job-1');
    expect(result).toEqual({ id: 'job-1' });
    expect(rolesFor('findJob')).toEqual(IMPORT_ROLES);
  });
});
