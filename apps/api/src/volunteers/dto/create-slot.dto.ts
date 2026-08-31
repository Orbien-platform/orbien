import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSlotDto {
  @IsString() @IsNotEmpty() role_name!: string;

  @IsOptional() @IsInt() @Min(1) @Type(() => Number) required_count: number = 1;

  @IsOptional() @IsString() notes?: string;
}
