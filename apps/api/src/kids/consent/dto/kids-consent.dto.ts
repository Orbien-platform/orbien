import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

// Sem `guardian_person_id`, o consentimento é da pessoa da conta logada. Só a
// gestão pode indicar outro responsável (secretaria registrando por ele).
export class RegisterKidsConsentDto {
  // A versão do termo que o responsável leu; tem de ser a vigente.
  @IsString() @IsNotEmpty() @MaxLength(60) term_version!: string;
  @IsOptional() @IsUUID() guardian_person_id?: string;
}

export class RevokeKidsConsentDto {
  @IsOptional() @IsUUID() guardian_person_id?: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class KidsConsentStatusQueryDto {
  @IsOptional() @IsUUID() guardian_person_id?: string;
}
