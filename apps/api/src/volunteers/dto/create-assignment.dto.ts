import { IsUUID } from 'class-validator';

export class CreateAssignmentDto {
  @IsUUID('4') slot_id!: string;

  @IsUUID('4') volunteer_profile_id!: string;
}
