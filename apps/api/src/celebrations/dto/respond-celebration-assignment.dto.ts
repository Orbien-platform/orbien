import { IsIn } from 'class-validator';
import { AssignmentStatus } from '@prisma/client';

export class RespondCelebrationAssignmentDto {
  @IsIn([AssignmentStatus.confirmed, AssignmentStatus.declined])
  status!: AssignmentStatus;
}
