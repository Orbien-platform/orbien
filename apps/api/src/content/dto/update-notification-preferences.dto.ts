import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  avisos?: boolean;

  @IsOptional()
  @IsBoolean()
  oracao?: boolean;

  @IsOptional()
  @IsBoolean()
  eventos?: boolean;

  @IsOptional()
  @IsBoolean()
  devocional?: boolean;
}
