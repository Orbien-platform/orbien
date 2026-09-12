import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCostCenterDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
