import { Reflector } from '@nestjs/core';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateUserDto, UpdateUserRoleDto } from './dto/create-user.dto';

const CREATE_ROLES = ['tenant_admin', 'pastor'];

const actor: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['pastor'],
  plan: 'starter',
};

const dto: CreateUserDto = {
  person_id: 'person-1',
  email: 'novo@igreja.test',
  role_code: 'secretary',
};

describe('UsersController', () => {
  it('create delega ao service com o dto e o usuário, e exige papel de dono do tenant', async () => {
    const usersService = {
      create: jest.fn().mockResolvedValue({ id: 'user-novo', email: dto.email }),
    } as unknown as jest.Mocked<UsersService>;
    const controller = new UsersController(usersService);

    const result = await controller.create(dto, actor);

    expect(usersService.create).toHaveBeenCalledWith(dto, actor);
    expect(result).toEqual({ id: 'user-novo', email: dto.email });

    const reflector = new Reflector();
    expect(
      reflector.get<string[]>(ROLES_KEY, UsersController.prototype.create),
    ).toEqual(CREATE_ROLES);
  });

  it('updateRole delega ao service com a pessoa, o dto e o usuário, e exige o mesmo papel do create', async () => {
    const roleDto: UpdateUserRoleDto = { role_code: 'secretary' };
    const usersService = {
      updateRole: jest.fn().mockResolvedValue({ id: 'user-1', role_code: 'secretary' }),
    } as unknown as jest.Mocked<UsersService>;
    const controller = new UsersController(usersService);

    const result = await controller.updateRole('person-1', roleDto, actor);

    expect(usersService.updateRole).toHaveBeenCalledWith('person-1', roleDto, actor);
    expect(result).toEqual({ id: 'user-1', role_code: 'secretary' });
    expect(
      new Reflector().get<string[]>(ROLES_KEY, UsersController.prototype.updateRole),
    ).toEqual(CREATE_ROLES);
  });
});
