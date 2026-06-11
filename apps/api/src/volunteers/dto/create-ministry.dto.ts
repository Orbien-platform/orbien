import { IsHexColor, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateMinistryDto {
  @IsString() @IsNotEmpty() name!: string;

  @IsOptional() @IsString() description?: string;

  @IsOptional() @IsHexColor() color?: string;
}
