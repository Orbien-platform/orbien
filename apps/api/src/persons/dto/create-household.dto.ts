import { IsNotEmpty, IsString } from 'class-validator';

export class CreateHouseholdDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome da família é obrigatório' })
  name!: string;
}
