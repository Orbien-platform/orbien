import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { MaterialVisibility } from '@prisma/client';

export class CreateMeetingMaterialDto {
  @IsUUID()
  material_id!: string;

  @IsOptional()
  @IsEnum(MaterialVisibility, { message: 'Visibilidade deve ser all ou leaders_only' })
  visibility?: MaterialVisibility;
}
