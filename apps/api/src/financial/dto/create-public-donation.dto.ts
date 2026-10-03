import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Limites da doação pública, os aceitos pela Asaas por cobrança: mínimo R$ 5,00
 * e máximo R$ 50.000,00 — o teto de conta de pessoa física, que vale também
 * para pessoa jurídica (R$ 500.000). Valores da Central de Ajuda da Asaas
 * ("Quais são os limites para criação de cobranças?"), conferidos em
 * 2026-10-03; a doc de referência da API não estava acessível.
 *
 * A rota é pública e escreve em `Decimal(12,2)`: sem teto, valor ≥ 10^10
 * estourava em 500 e `10.123` era arredondado em silêncio.
 */
export const PUBLIC_DONATION_MIN_AMOUNT = 5;
export const PUBLIC_DONATION_MAX_AMOUNT = 50_000;

export class CreatePublicDonationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  tenant_slug!: string;

  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Informe um valor numérico com no máximo 2 casas decimais' },
  )
  @Min(PUBLIC_DONATION_MIN_AMOUNT, { message: 'O valor mínimo da doação é R$ 5,00' })
  @Max(PUBLIC_DONATION_MAX_AMOUNT, { message: 'O valor máximo da doação é R$ 50.000,00' })
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  donor_name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  donor_email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  category_slug?: string;

  // Honeypot anti-spam — deve estar no DTO por causa do forbidNonWhitelisted global
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}
