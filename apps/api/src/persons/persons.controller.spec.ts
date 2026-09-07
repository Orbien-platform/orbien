import { Reflector } from '@nestjs/core';
import { PersonsController } from './persons.controller';
import { PersonsService } from './persons.service';
import { ClassificationService } from './classification.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const READ_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'secretary', 'treasurer'];
const WRITE_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'secretary'];

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['secretary'],
  plan: 'starter',
};

function rolesFor(methodName: keyof PersonsController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, PersonsController.prototype[methodName]);
}

describe('PersonsController', () => {
  let personsService: jest.Mocked<PersonsService>;
  let classificationService: jest.Mocked<ClassificationService>;
  let controller: PersonsController;

  beforeEach(() => {
    personsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      anonymize: jest.fn(),
      createHousehold: jest.fn(),
      findHousehold: jest.fn(),
      addHouseholdMember: jest.fn(),
    } as unknown as jest.Mocked<PersonsService>;

    classificationService = {
      manualReclassify: jest.fn(),
      findHistory: jest.fn(),
    } as unknown as jest.Mocked<ClassificationService>;

    controller = new PersonsController(personsService, classificationService);
  });

  it('createHousehold delega ao service e exige papel de escrita', async () => {
    personsService.createHousehold.mockResolvedValue({ id: 'h1' } as never);

    const result = await controller.createHousehold({ name: 'Família' } as never, user);

    expect(personsService.createHousehold).toHaveBeenCalledWith({ name: 'Família' }, user);
    expect(result).toEqual({ id: 'h1' });
    expect(rolesFor('createHousehold')).toEqual(WRITE_ROLES);
  });

  it('findHousehold delega ao service e exige papel de leitura', async () => {
    personsService.findHousehold.mockResolvedValue({ id: 'h1' } as never);

    const result = await controller.findHousehold('h1');

    expect(personsService.findHousehold).toHaveBeenCalledWith('h1');
    expect(result).toEqual({ id: 'h1' });
    expect(rolesFor('findHousehold')).toEqual(READ_ROLES);
  });

  it('addHouseholdMember delega ao service e exige papel de escrita', async () => {
    personsService.addHouseholdMember.mockResolvedValue({ id: 'hm1' } as never);

    const result = await controller.addHouseholdMember('h1', { person_id: 'p1', role: 'spouse' } as never);

    expect(personsService.addHouseholdMember).toHaveBeenCalledWith('h1', { person_id: 'p1', role: 'spouse' });
    expect(result).toEqual({ id: 'hm1' });
    expect(rolesFor('addHouseholdMember')).toEqual(WRITE_ROLES);
  });

  it('create delega ao service com o usuário atual e exige papel de escrita', async () => {
    personsService.create.mockResolvedValue({ person: { id: 'p1' }, possible_duplicates: [] } as never);

    const result = await controller.create({ full_name: 'Ana' } as never, user);

    expect(personsService.create).toHaveBeenCalledWith({ full_name: 'Ana' }, user);
    expect(result).toEqual({ person: { id: 'p1' }, possible_duplicates: [] });
    expect(rolesFor('create')).toEqual(WRITE_ROLES);
  });

  it('findAll delega ao service com a query e exige papel de leitura', async () => {
    personsService.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });

    const result = await controller.findAll({ page: 1, limit: 20 } as never);

    expect(personsService.findAll).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
    expect(rolesFor('findAll')).toEqual(READ_ROLES);
  });

  it('reclassify delega ao classificationService com o id do usuário como changedBy', async () => {
    classificationService.manualReclassify.mockResolvedValue(undefined);

    await controller.reclassify(
      'p1',
      { classification: 'member', reason: 'promoção' } as never,
      user,
    );

    expect(classificationService.manualReclassify).toHaveBeenCalledWith(
      'p1',
      'member',
      'promoção',
      'user-1',
    );
    expect(rolesFor('reclassify')).toEqual([
      'tenant_admin',
      'admin_congregation',
      'pastor',
      'secretary',
    ]);
  });

  it('classificationHistory delega ao classificationService e exige papel de leitura', async () => {
    classificationService.findHistory.mockResolvedValue([]);

    const result = await controller.classificationHistory('p1');

    expect(classificationService.findHistory).toHaveBeenCalledWith('p1');
    expect(result).toEqual([]);
    expect(rolesFor('classificationHistory')).toEqual(READ_ROLES);
  });

  it('findOne delega ao service e exige papel de leitura', async () => {
    personsService.findOne.mockResolvedValue({ id: 'p1' } as never);

    const result = await controller.findOne('p1');

    expect(personsService.findOne).toHaveBeenCalledWith('p1');
    expect(result).toEqual({ id: 'p1' });
    expect(rolesFor('findOne')).toEqual(READ_ROLES);
  });

  it('update delega ao service e exige papel de escrita', async () => {
    personsService.update.mockResolvedValue({ id: 'p1', phone: '+5511900000000' } as never);

    const result = await controller.update('p1', { phone: '+5511900000000' } as never);

    expect(personsService.update).toHaveBeenCalledWith('p1', { phone: '+5511900000000' });
    expect(result).toEqual({ id: 'p1', phone: '+5511900000000' });
    expect(rolesFor('update')).toEqual(WRITE_ROLES);
  });

  it('remove delega ao service com o usuário atual e exige papel restrito a admins', async () => {
    personsService.remove.mockResolvedValue({ id: 'p1' } as never);

    const result = await controller.remove('p1', user);

    expect(personsService.remove).toHaveBeenCalledWith('p1', user);
    expect(result).toEqual({ id: 'p1' });
    expect(rolesFor('remove')).toEqual(['tenant_admin', 'admin_congregation']);
  });

  it('anonymize delega ao service com o usuário atual e exige papel restrito a admins', async () => {
    personsService.anonymize.mockResolvedValue({ id: 'p1', full_name: 'ANONIMIZADO' } as never);

    const result = await controller.anonymize('p1', user);

    expect(personsService.anonymize).toHaveBeenCalledWith('p1', user);
    expect(result).toEqual({ id: 'p1', full_name: 'ANONIMIZADO' });
    expect(rolesFor('anonymize')).toEqual(['tenant_admin', 'admin_congregation']);
  });
});
