import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { GroupMemberRole } from '@prisma/client';

export class AddMemberDto {
  @IsUUID()
  person_id!: string;

  @IsOptional()
  @IsEnum(GroupMemberRole, { message: 'Role inválido' })
  role?: GroupMemberRole;
}
