import { IsEmail, IsIn, IsNotEmpty, IsString, IsUUID } from 'class-validator';

/**
 * Papéis atribuíveis por este endpoint. `platform_support` fica de fora de
 * propósito — é papel de plataforma, concedido só via `role_assignments`
 * direto no banco, nunca pelo dono do tenant (ver CLAUDE.md).
 */
export const ASSIGNABLE_ROLES = [
  'tenant_admin',
  'admin_congregation',
  'pastor',
  'secretary',
  'treasurer',
  'cell_leader',
  'ministry_leader',
  'volunteer',
  'member',
] as const;

export class CreateUserDto {
  @IsUUID('4', { message: 'person_id deve ser um UUID válido' })
  person_id!: string;

  @IsEmail({}, { message: 'E-mail inválido' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'role_code é obrigatório' })
  @IsIn(ASSIGNABLE_ROLES, { message: 'Papel inválido' })
  role_code!: (typeof ASSIGNABLE_ROLES)[number];
}
