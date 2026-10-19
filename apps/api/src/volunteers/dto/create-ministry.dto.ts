import { IsBoolean, IsHexColor, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateMinistryDto {
  @IsString() @IsNotEmpty() name!: string;

  @IsOptional() @IsString() description?: string;

  @IsOptional() @IsHexColor() color?: string;

  @IsOptional() @IsUUID('4') parent_ministry_id?: string;

  // Quem está escalado neste ministério lança a contagem de público do culto.
  @IsOptional() @IsBoolean() counts_attendance?: boolean;
}
