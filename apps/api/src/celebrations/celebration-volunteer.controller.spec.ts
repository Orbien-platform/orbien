import { Reflector } from '@nestjs/core';
import {
  CelebrationRespondController,
  CelebrationMyAssignmentsController,
} from './celebration-volunteer.controller';
import { CelebrationAssignmentService } from './celebration-assignment.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const VOLUNTEER_ROLES = [
  'volunteer',
  'member',
  'ministry_leader',
  'pastor',
  'admin_congregation',
  'tenant_admin',
];

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['volunteer'],
  plan: 'starter',
};

describe('CelebrationRespondController', () => {
  let assignmentService: jest.Mocked<CelebrationAssignmentService>;
  let controller: CelebrationRespondController;

  beforeEach(() => {
    assignmentService = {
      respondToAssignment: jest.fn(),
    } as unknown as jest.Mocked<CelebrationAssignmentService>;

    controller = new CelebrationRespondController(assignmentService);
  });

  it('respond delega ao service com o sub do usuário e exige papel de voluntário', async () => {
    assignmentService.respondToAssignment.mockResolvedValue({ id: 'a1', status: 'confirmed' } as never);

    const result = await controller.respond('a1', { status: 'confirmed' } as never, user);

    expect(assignmentService.respondToAssignment).toHaveBeenCalledWith('a1', 'user-1', 'tenant-1', {
      status: 'confirmed',
    });
    expect(result).toEqual({ id: 'a1', status: 'confirmed' });

    const reflector = new Reflector();
    expect(
      reflector.get<string[] | undefined>(ROLES_KEY, CelebrationRespondController.prototype.respond),
    ).toEqual(VOLUNTEER_ROLES);
  });
});

describe('CelebrationMyAssignmentsController', () => {
  let assignmentService: jest.Mocked<CelebrationAssignmentService>;
  let controller: CelebrationMyAssignmentsController;

  beforeEach(() => {
    assignmentService = {
      getMyAssignments: jest.fn(),
    } as unknown as jest.Mocked<CelebrationAssignmentService>;

    controller = new CelebrationMyAssignmentsController(assignmentService);
  });

  it('getMyAssignments usa includePast=false quando ausente na query', async () => {
    assignmentService.getMyAssignments.mockResolvedValue([] as never);

    const result = await controller.getMyAssignments({} as never, user);

    expect(assignmentService.getMyAssignments).toHaveBeenCalledWith(
      'user-1',
      'tenant-1',
      'cong-1',
      false,
    );
    expect(result).toEqual([]);

    const reflector = new Reflector();
    expect(
      reflector.get<string[] | undefined>(
        ROLES_KEY,
        CelebrationMyAssignmentsController.prototype.getMyAssignments,
      ),
    ).toEqual(VOLUNTEER_ROLES);
  });

  it('getMyAssignments repassa includePast=true quando informado', async () => {
    assignmentService.getMyAssignments.mockResolvedValue([] as never);

    await controller.getMyAssignments({ includePast: true } as never, user);

    expect(assignmentService.getMyAssignments).toHaveBeenCalledWith(
      'user-1',
      'tenant-1',
      'cong-1',
      true,
    );
  });
});
