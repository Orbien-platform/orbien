import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { VolunteerMinistryRole } from '@prisma/client';

export class UpdateVolunteerMinistryDto {
  @IsOptional()
  @IsEnum(VolunteerMinistryRole, { message: 'role deve ser leader ou volunteer' })
  role?: VolunteerMinistryRole;

  @IsOptional() @IsBoolean() is_primary_leader?: boolean;
}
