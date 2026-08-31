import {
  IsDate,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Gender, MaritalStatus, PersonClassification } from '@prisma/client';

export class CreatePersonDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome completo é obrigatório' })
  full_name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'E-mail inválido' })
  email?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'Data de nascimento inválida' })
  birth_date?: Date;

  @IsOptional()
  @IsEnum(Gender, { message: 'Gênero inválido' })
  gender?: Gender;

  @IsOptional()
  @IsEnum(MaritalStatus, { message: 'Estado civil inválido' })
  marital_status?: MaritalStatus;

  @IsOptional()
  @IsString()
  profession?: string;

  @IsOptional()
  @IsString()
  address_street?: string;

  @IsOptional()
  @IsString()
  address_number?: string;

  @IsOptional()
  @IsString()
  address_complement?: string;

  @IsOptional()
  @IsString()
  address_neighborhood?: string;

  @IsOptional()
  @IsString()
  address_city?: string;

  @IsOptional()
  @IsString()
  address_state?: string;

  @IsOptional()
  @IsString()
  address_zip?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'Data de batismo inválida' })
  baptism_date?: Date;

  // Required when classification === 'member'; optional otherwise.
  // @IsOptional() is intentionally absent so @ValidateIf can enforce presence.
  @ValidateIf((o: CreatePersonDto) => o.classification === PersonClassification.member)
  @IsNotEmpty({ message: 'Data de membresia é obrigatória para membros' })
  @IsDateString({}, { message: 'Data de membresia inválida' })
  membership_date?: string;

  @IsOptional()
  @IsString()
  former_denomination?: string;

  @IsOptional()
  @IsString()
  origin_congregation?: string;

  @IsOptional()
  @IsEnum(PersonClassification, { message: 'Classificação inválida' })
  classification?: PersonClassification;

  @IsOptional()
  @IsUUID('4', { message: 'household_id deve ser um UUID válido' })
  household_id?: string;
}
