import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateQrTokenDto {
  @IsOptional()
  @IsString()
  @MaxLength(80, { message: 'label deve ter no máximo 80 caracteres' })
  label?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
