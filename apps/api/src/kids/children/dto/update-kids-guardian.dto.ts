import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// Só o que muda numa relação já cadastrada: quem é a pessoa não muda (para isso,
// remove e adiciona). Ausente não mexe; o service recusa corpo sem nenhum campo.
export class UpdateKidsGuardianDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(60) relationship?: string;
  @IsOptional() @IsBoolean() can_pickup?: boolean;
  @IsOptional() @IsBoolean() is_primary?: boolean;
}
