import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Correção pelo próprio titular (LGPD, Art. 18, III — mapeamento §4.2).
 *
 * Só dado básico de contato e endereço. Fica de fora, de propósito:
 * - `email`: o e-mail da pessoa costuma ser o de login, e trocar um sem o
 *   outro desalinha os dois — a troca de e-mail de acesso é outro fluxo;
 * - classificação, ministérios, datas eclesiásticas: "dados sensíveis só por
 *   admin da congregação" (§4.2).
 *
 * `null` apaga o campo; ausente não mexe.
 */
export class UpdateMyDataDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Nome deve ter ao menos 2 caracteres' })
  @MaxLength(200)
  full_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'Data de nascimento inválida' })
  birth_date?: Date | null;

  @IsOptional() @IsString() @MaxLength(200) address_street?: string | null;
  @IsOptional() @IsString() @MaxLength(20) address_number?: string | null;
  @IsOptional() @IsString() @MaxLength(100) address_complement?: string | null;
  @IsOptional() @IsString() @MaxLength(100) address_neighborhood?: string | null;
  @IsOptional() @IsString() @MaxLength(100) address_city?: string | null;
  @IsOptional() @IsString() @MaxLength(2) address_state?: string | null;
  @IsOptional() @IsString() @MaxLength(10) address_zip?: string | null;
}
