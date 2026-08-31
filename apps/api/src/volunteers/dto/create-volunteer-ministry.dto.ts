import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { VolunteerMinistryRole } from '@prisma/client';

export class CreateVolunteerMinistryDto {
  @IsUUID('4') volunteer_profile_id!: string;

  @IsUUID('4') ministry_id!: string;

  @IsOptional()
  @IsEnum(VolunteerMinistryRole, { message: 'role deve ser leader ou volunteer' })
  role?: VolunteerMinistryRole;

  @IsOptional() @IsBoolean() is_primary_leader?: boolean;
}
