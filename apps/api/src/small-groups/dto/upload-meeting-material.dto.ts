import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { MaterialVisibility } from '@prisma/client';

// Campos de um multipart: chegam todos como string, então nada aqui é número
// nem booleano. O arquivo vem em `file`, fora do DTO.
export class UploadMeetingMaterialDto {
  @IsString()
  @IsNotEmpty({ message: 'Informe o título do material' })
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsEnum(MaterialVisibility, { message: 'Visibilidade deve ser all ou leaders_only' })
  visibility?: MaterialVisibility;

  @IsOptional()
  @IsDateString({}, { message: 'release_at deve ser uma data ISO válida' })
  release_at?: string;
}
