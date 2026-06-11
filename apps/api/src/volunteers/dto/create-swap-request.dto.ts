import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateSwapRequestDto {
  @IsUUID()
  assignment_id!: string;

  @IsOptional()
  @IsString()
  message?: string;
}
