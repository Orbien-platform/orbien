import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, IsUrl, MaxLength, ValidateIf } from 'class-validator';

// Duas formas de indicar o autorizado: uma pessoa já cadastrada
// (`guardian_person_id`) ou um terceiro novo (nome + telefone, foto opcional).
// O service garante que venha exatamente uma.
export class AddKidsGuardianDto {
  @IsOptional() @IsUUID() guardian_person_id?: string;

  @ValidateIf((o: AddKidsGuardianDto) => !o.guardian_person_id)
  @IsString() @IsNotEmpty() @MaxLength(200)
  full_name?: string;

  @ValidateIf((o: AddKidsGuardianDto) => !o.guardian_person_id)
  @IsString() @IsNotEmpty() @MaxLength(30)
  phone?: string;

  @IsOptional() @IsUrl({ require_tld: false }) @MaxLength(2000) photo_url?: string;

  // Parentesco com a criança ("avó", "vizinha"...).
  @IsString() @IsNotEmpty() @MaxLength(60) relationship!: string;

  @IsOptional() @IsBoolean() can_pickup?: boolean;
  @IsOptional() @IsBoolean() is_primary?: boolean;
}
