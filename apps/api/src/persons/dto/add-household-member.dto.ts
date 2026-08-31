import { IsEnum, IsUUID } from 'class-validator';
import { HouseholdMemberRole } from '@prisma/client';

export class AddHouseholdMemberDto {
  @IsUUID('4', { message: 'person_id deve ser um UUID válido' })
  person_id!: string;

  @IsEnum(HouseholdMemberRole, { message: 'Papel inválido' })
  role!: HouseholdMemberRole;
}
