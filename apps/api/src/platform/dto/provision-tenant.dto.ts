import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { PlanType } from '@prisma/client';

export class ProvisionTenantDto {
  // O slug é a chave pública do tenant (subdomínio, login, branding). Restringir
  // aqui evita descobrir na unique constraint que 'Igreja X' virou slug.
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'slug deve conter apenas minúsculas, números e hífens',
  })
  @MinLength(3)
  slug!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(PlanType)
  plan?: PlanType;

  @IsString()
  @MinLength(2)
  congregation_name!: string;

  @IsOptional()
  @IsString()
  congregation_timezone?: string;

  @IsEmail()
  admin_email!: string;

  @IsString()
  @MinLength(8)
  admin_password!: string;
}
