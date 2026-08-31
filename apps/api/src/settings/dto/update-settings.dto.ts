import { IsEmail, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class TenantSettingsDto {
  @IsOptional() @IsString() name?: string;

  @IsOptional() @IsEmail({}, { message: 'E-mail inválido' }) email?: string;

  @IsOptional() @IsString() phone?: string;
}

class CongregationSettingsDto {
  @IsOptional() @IsString() name?: string;

  @IsOptional() @IsString() address?: string;

  @IsOptional() @IsString() timezone?: string;

  @IsOptional() @IsEmail({}, { message: 'E-mail inválido' }) email?: string;

  @IsOptional() @IsString() phone?: string;

  @IsOptional() @IsString() app_name?: string;

  @IsOptional() @IsString() primary_color?: string;
}

export class UpdateSettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => TenantSettingsDto)
  tenant?: TenantSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CongregationSettingsDto)
  congregation?: CongregationSettingsDto;
}
