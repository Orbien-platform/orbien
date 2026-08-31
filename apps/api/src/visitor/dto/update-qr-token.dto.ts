import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateQrTokenDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
