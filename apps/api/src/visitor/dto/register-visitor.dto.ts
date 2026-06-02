import {
  Equals,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Gender } from '@prisma/client';

export class RegisterVisitorDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Nome deve ter ao menos 2 caracteres' })
  full_name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'E-mail inválido' })
  email?: string;

  @IsOptional()
  @IsEnum(Gender, { message: 'Gênero inválido' })
  gender?: Gender;

  @IsBoolean({ message: 'lgpd_consent deve ser booleano' })
  @Equals(true, { message: 'É necessário aceitar os termos para continuar' })
  lgpd_consent!: boolean;
}
