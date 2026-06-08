import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class CreatePixDto {
  @IsString()
  @IsNotEmpty()
  tenant_slug!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsString()
  donor_name?: string;

  @IsOptional()
  @IsEmail()
  donor_email?: string;

  @IsOptional()
  @IsString()
  category_slug?: string;

  // Honeypot anti-spam — deve estar no DTO por causa do forbidNonWhitelisted global
  @IsOptional()
  @IsString()
  website?: string;
}
