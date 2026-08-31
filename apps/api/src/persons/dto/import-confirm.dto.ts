import { IsObject, IsString, IsUUID } from 'class-validator';

export class ImportMappingDto {
  nome?: string;
  telefone?: string;
  email?: string;
  sexo?: string;
  birth_date?: string;
  classificação?: string;
}

export class ImportConfirmDto {
  @IsString()
  file_id!: string;

  @IsObject()
  mapping!: ImportMappingDto;
}
