import { Reflector } from '@nestjs/core';
import { SongsController } from './songs.controller';
import { SongsService } from './songs.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const EDIT_ROLES = ['admin_congregation', 'pastor', 'tenant_admin', 'ministry_leader'];

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['ministry_leader'],
  plan: 'starter',
};

function rolesFor(methodName: keyof SongsController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, SongsController.prototype[methodName]);
}

describe('SongsController', () => {
  let songsService: jest.Mocked<SongsService>;
  let controller: SongsController;

  beforeEach(() => {
    songsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<SongsService>;

    controller = new SongsController(songsService);
  });

  it('create delega ao service e exige papel de edição', async () => {
    songsService.create.mockResolvedValue({ id: 's1' } as never);

    const result = await controller.create({ title: 'Grande é o Senhor' } as never, user);

    expect(songsService.create).toHaveBeenCalledWith('tenant-1', 'cong-1', {
      title: 'Grande é o Senhor',
    });
    expect(result).toEqual({ id: 's1' });
    expect(rolesFor('create')).toEqual(EDIT_ROLES);
  });

  it('findAll delega ao service e não exige papel de edição (qualquer usuário autenticado)', async () => {
    songsService.findAll.mockResolvedValue([{ id: 's1' }] as never);

    const result = await controller.findAll(user);

    expect(songsService.findAll).toHaveBeenCalledWith('tenant-1', 'cong-1');
    expect(result).toEqual([{ id: 's1' }]);
    expect(rolesFor('findAll')).toBeUndefined();
  });

  it('update delega ao service e exige papel de edição', async () => {
    songsService.update.mockResolvedValue({ id: 's1', title: 'Novo título' } as never);

    const result = await controller.update('s1', { title: 'Novo título' } as never, user);

    expect(songsService.update).toHaveBeenCalledWith('tenant-1', 'cong-1', 's1', {
      title: 'Novo título',
    });
    expect(result).toEqual({ id: 's1', title: 'Novo título' });
    expect(rolesFor('update')).toEqual(EDIT_ROLES);
  });

  it('remove delega ao service e exige papel de edição', async () => {
    songsService.remove.mockResolvedValue({ id: 's1' } as never);

    const result = await controller.remove('s1', user);

    expect(songsService.remove).toHaveBeenCalledWith('tenant-1', 'cong-1', 's1');
    expect(result).toEqual({ id: 's1' });
    expect(rolesFor('remove')).toEqual(EDIT_ROLES);
  });
});
