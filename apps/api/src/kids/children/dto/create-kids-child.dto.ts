import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

// Teto dos campos de saúde: texto livre, mas não um documento.
export const HEALTH_TEXT_MAX = 2000;

export class CreateKidsChildDto {
  @IsString() @IsNotEmpty() @MaxLength(200) full_name!: string;

  // Sem o nascimento não há faixa etária a validar no check-in.
  @Type(() => Date) @IsDate({ message: 'Data de nascimento inválida' }) birth_date!: Date;

  @IsOptional() @IsString() @MaxLength(HEALTH_TEXT_MAX) allergies?: string;
  @IsOptional() @IsString() @MaxLength(HEALTH_TEXT_MAX) medical_notes?: string;

  // Parentesco de quem cadastra com a criança ("mãe", "avó"...).
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(60) relationship?: string;

  // Só a equipe: cadastra no lugar do responsável (AC 7). Sem ele, o
  // responsável é a pessoa da conta logada.
  @IsOptional() @IsUUID() guardian_person_id?: string;

  // Só a equipe: a secretaria afirma que registrou o consentimento do
  // responsável (origem `secretaria`). Sem consentimento vigente e sem este
  // aceite, o cadastro é recusado com 422.
  @IsOptional() @IsBoolean() register_consent?: boolean;
}
