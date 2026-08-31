import {
  Equals,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { WaitlistSizeRange } from '@prisma/client';

export class CreateWaitlistDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  pastor_name!: string;

  @IsOptional()
  @IsString()
  church_name?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @ValidateIf((o: CreateWaitlistDto) => o.state !== undefined && o.state !== null)
  @Length(2, 2)
  state?: string;

  @IsEnum(WaitlistSizeRange)
  size_range!: WaitlistSizeRange;

  @IsBoolean()
  @Equals(true, { message: 'É obrigatório aceitar os termos de uso e política de privacidade' })
  lgpd_consent!: boolean;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  utm_source?: string;

  @IsOptional()
  @IsString()
  utm_medium?: string;

  @IsOptional()
  @IsString()
  utm_campaign?: string;
}
