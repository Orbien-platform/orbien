import { Reflector } from '@nestjs/core';
import { CelebrationAssignmentController } from './celebration-assignment.controller';
import { CelebrationAssignmentService } from './celebration-assignment.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const ASSIGNMENT_ROLES = ['ministry_leader', 'admin_congregation', 'tenant_admin'];
const PUBLISH_ROLES = ['admin_congregation', 'tenant_admin', 'pastor'];

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['ministry_leader'],
  plan: 'starter',
};

function rolesFor(methodName: keyof CelebrationAssignmentController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(
    ROLES_KEY,
    CelebrationAssignmentController.prototype[methodName],
  );
}

describe('CelebrationAssignmentController', () => {
  let assignmentService: jest.Mocked<CelebrationAssignmentService>;
  let controller: CelebrationAssignmentController;

  beforeEach(() => {
    assignmentService = {
      createAssignment: jest.fn(),
      removeAssignment: jest.fn(),
      publish: jest.fn(),
    } as unknown as jest.Mocked<CelebrationAssignmentService>;

    controller = new CelebrationAssignmentController(assignmentService);
  });

  it('createAssignment delega ao service com sub e roles do usuário', async () => {
    assignmentService.createAssignment.mockResolvedValue({ id: 'a1' } as never);

    const result = await controller.createAssignment(
      'i1',
      'cm1',
      { volunteer_profile_id: 'vp1' } as never,
      user,
    );

    expect(assignmentService.createAssignment).toHaveBeenCalledWith(
      'tenant-1',
      'cong-1',
      'i1',
      'cm1',
      'user-1',
      ['ministry_leader'],
      { volunteer_profile_id: 'vp1' },
    );
    expect(result).toEqual({ id: 'a1' });
    expect(rolesFor('createAssignment')).toEqual(ASSIGNMENT_ROLES);
  });

  it('removeAssignment delega ao service com sub e roles do usuário', async () => {
    assignmentService.removeAssignment.mockResolvedValue({ id: 'a1' } as never);

    const result = await controller.removeAssignment('i1', 'cm1', 'a1', user);

    expect(assignmentService.removeAssignment).toHaveBeenCalledWith(
      'tenant-1',
      'cong-1',
      'i1',
      'cm1',
      'a1',
      'user-1',
      ['ministry_leader'],
    );
    expect(result).toEqual({ id: 'a1' });
    expect(rolesFor('removeAssignment')).toEqual(ASSIGNMENT_ROLES);
  });

  it('publish delega ao service e exige papel de publicação', async () => {
    assignmentService.publish.mockResolvedValue({ id: 's1' } as never);

    const result = await controller.publish('i1', user);

    expect(assignmentService.publish).toHaveBeenCalledWith('tenant-1', 'cong-1', 'i1');
    expect(result).toEqual({ id: 's1' });
    expect(rolesFor('publish')).toEqual(PUBLISH_ROLES);
  });
});
