import { Reflector } from '@nestjs/core';
import { SetlistSongsController } from './setlist-songs.controller';
import { SetlistSongsService } from './setlist-songs.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const EDIT_ROLES = ['admin_congregation', 'pastor', 'tenant_admin', 'secretary', 'ministry_leader'];

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['ministry_leader'],
  plan: 'starter',
};

function rolesFor(methodName: keyof SetlistSongsController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, SetlistSongsController.prototype[methodName]);
}

describe('SetlistSongsController', () => {
  let songsService: jest.Mocked<SetlistSongsService>;
  let controller: SetlistSongsController;

  beforeEach(() => {
    songsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      reorder: jest.fn(),
    } as unknown as jest.Mocked<SetlistSongsService>;

    controller = new SetlistSongsController(songsService);
  });

  it('create delega ao service', async () => {
    songsService.create.mockResolvedValue({ id: 'song1' } as never);

    const result = await controller.create({ title: 'Música' } as never, user);

    expect(songsService.create).toHaveBeenCalledWith('tenant-1', 'cong-1', { title: 'Música' });
    expect(result).toEqual({ id: 'song1' });
    expect(rolesFor('create')).toEqual(EDIT_ROLES);
  });

  it('findAll delega ao service com o setlist_id da query', async () => {
    songsService.findAll.mockResolvedValue([{ id: 'song1' }] as never);

    const result = await controller.findAll('sl1', user);

    expect(songsService.findAll).toHaveBeenCalledWith('tenant-1', 'cong-1', 'sl1');
    expect(result).toEqual([{ id: 'song1' }]);
    expect(rolesFor('findAll')).toEqual(EDIT_ROLES);
  });

  it('findOne delega ao service', async () => {
    songsService.findOne.mockResolvedValue({ id: 'song1' } as never);

    const result = await controller.findOne('song1', user);

    expect(songsService.findOne).toHaveBeenCalledWith('tenant-1', 'cong-1', 'song1');
    expect(result).toEqual({ id: 'song1' });
    expect(rolesFor('findOne')).toEqual(EDIT_ROLES);
  });

  it('update delega ao service', async () => {
    songsService.update.mockResolvedValue({ id: 'song1' } as never);

    const result = await controller.update('song1', { title: 'Novo' } as never, user);

    expect(songsService.update).toHaveBeenCalledWith('tenant-1', 'cong-1', 'song1', { title: 'Novo' });
    expect(result).toEqual({ id: 'song1' });
    expect(rolesFor('update')).toEqual(EDIT_ROLES);
  });

  it('remove delega ao service', async () => {
    songsService.remove.mockResolvedValue({ id: 'song1' } as never);

    const result = await controller.remove('song1', user);

    expect(songsService.remove).toHaveBeenCalledWith('tenant-1', 'cong-1', 'song1');
    expect(result).toEqual({ id: 'song1' });
    expect(rolesFor('remove')).toEqual(EDIT_ROLES);
  });

  it('reorder delega ao service', async () => {
    songsService.reorder.mockResolvedValue(undefined);

    const result = await controller.reorder({ songs: [] } as never, user);

    expect(songsService.reorder).toHaveBeenCalledWith('tenant-1', 'cong-1', { songs: [] });
    expect(result).toBeUndefined();
    expect(rolesFor('reorder')).toEqual(EDIT_ROLES);
  });
});
