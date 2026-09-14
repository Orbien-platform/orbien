import { Reflector } from '@nestjs/core';
import { GroupMessagesController } from './group-messages.controller';
import { GroupMessagesService } from './group-messages.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = {
  sub: 'u1',
  tenant_id: 't1',
  congregation_id: 'g1',
  roles: ['member'],
  plan: 'starter',
};

const CHAT_ROLES = [
  'member',
  'cell_leader',
  'secretary',
  'pastor',
  'admin_congregation',
  'tenant_admin',
];

function rolesFor(methodName: keyof GroupMessagesController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(
    ROLES_KEY,
    GroupMessagesController.prototype[methodName],
  );
}

describe('GroupMessagesController', () => {
  let service: jest.Mocked<GroupMessagesService>;
  let controller: GroupMessagesController;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findByGroup: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<GroupMessagesService>;

    controller = new GroupMessagesController(service);
  });

  it('as três rotas exigem papel autenticado, e o mesmo conjunto', () => {
    expect(rolesFor('create')).toEqual(CHAT_ROLES);
    expect(rolesFor('findByGroup')).toEqual(CHAT_ROLES);
    expect(rolesFor('remove')).toEqual(CHAT_ROLES);
  });

  it('não expõe o chat a `volunteer` nem a `treasurer` — papel de célula é outro', () => {
    expect(rolesFor('findByGroup')).not.toContain('volunteer');
    expect(rolesFor('findByGroup')).not.toContain('treasurer');
  });

  it('repassa grupo, corpo e usuário para o service ao enviar', async () => {
    await controller.create('sg1', { content: 'bom dia' }, USER);
    expect(service.create).toHaveBeenCalledWith('sg1', { content: 'bom dia' }, USER);
  });

  it('repassa a query de paginação para o service ao listar', async () => {
    await controller.findByGroup('sg1', { before: 'm9', limit: 20 }, USER);
    expect(service.findByGroup).toHaveBeenCalledWith('sg1', { before: 'm9', limit: 20 }, USER);
  });

  it('repassa grupo, mensagem e usuário para o service ao remover', async () => {
    await controller.remove('sg1', 'm1', USER);
    expect(service.remove).toHaveBeenCalledWith('sg1', 'm1', USER);
  });
});
