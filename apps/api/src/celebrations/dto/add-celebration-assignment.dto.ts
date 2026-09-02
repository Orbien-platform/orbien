import { IsUUID } from 'class-validator';

export class AddCelebrationAssignmentDto {
  @IsUUID()
  volunteer_profile_id!: string;
}
