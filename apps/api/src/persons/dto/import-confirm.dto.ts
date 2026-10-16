import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

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

  // Quando `false`, a importação não envia o e-mail de convite de primeiro
  // acesso. Omitido = `true` (comportamento histórico).
  @IsOptional()
  @IsBoolean()
  send_invites?: boolean;
}
