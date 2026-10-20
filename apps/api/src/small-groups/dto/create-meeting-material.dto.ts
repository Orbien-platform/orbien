import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { MaterialVisibility } from '@prisma/client';

export class CreateMeetingMaterialDto {
  @IsUUID()
  material_id!: string;

  @IsOptional()
  @IsEnum(MaterialVisibility, { message: 'Visibilidade deve ser all ou leaders_only' })
  visibility?: MaterialVisibility;

  // Ausente = liberado na hora. Data futura = o material só aparece para o
  // público da visibilidade a partir dela (líder enxerga antes).
  @IsOptional()
  @IsDateString({}, { message: 'release_at deve ser uma data ISO válida' })
  release_at?: string;
}
