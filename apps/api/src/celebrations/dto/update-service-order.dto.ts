import { IsOptional, IsString } from 'class-validator';

export class UpdateServiceOrderDto {
  @IsOptional()
  @IsString()
  title?: string;
}
