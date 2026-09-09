import { IsEmail, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import {
  IsAccessibleBrandColor,
  IsBrandColor,
} from '../../common/validators/brand-color.validator';

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

  // Cor de CTA: barrada quando falha AA contra branco (§6 do
  // STYLE-GUIDE.md do mobile). Ver o validador para por que a checagem
  // vive no cadastro e não só no front.
  @IsOptional() @IsString() @IsAccessibleBrandColor() primary_color?: string;

  /**
   * Cor de destaque (accent). Gravada em `congregations.accent_color`; sem
   * ela, vale a do tenant (`branding_configs.secondary_color`).
   *
   * Só o formato é validado, **não** o contraste: o accent é cor de
   * ícone/label sobre superfície, e as superfícies são duas (clara e
   * escura). Exigir AA nas duas rejeitaria o próprio teal da plataforma
   * (~2.4:1 sobre branco, ~9:1 sobre o fundo escuro) — e quem já resolve
   * isso em runtime é o `accentReadable` do app, que cai na cor primária
   * quando o accent não passa AA na superfície ativa.
   */
  @IsOptional() @IsString() @IsBrandColor() accent_color?: string;
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
