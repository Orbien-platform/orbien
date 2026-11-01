import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { HEALTH_TEXT_MAX } from './create-kids-child.dto';

export class UpdateKidsChildDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) full_name?: string;

  @IsOptional() @Type(() => Date) @IsDate({ message: 'Data de nascimento inválida' }) birth_date?: Date;

  // `null` limpa o campo; ausente não mexe.
  @ValidateIf((_o, v) => v !== null) @IsOptional() @IsString() @MaxLength(HEALTH_TEXT_MAX) allergies?: string | null;
  @ValidateIf((_o, v) => v !== null) @IsOptional() @IsString() @MaxLength(HEALTH_TEXT_MAX) medical_notes?: string | null;
}
