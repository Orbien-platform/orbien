import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { MaterialAudience, MaterialVisibility, StudyMaterialSource } from '@prisma/client';

export class CreateStudyMaterialDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  author?: string;

  @IsEnum(StudyMaterialSource, { message: 'source_type inválido' })
  source_type!: StudyMaterialSource;

  // Required when source_type === rich_text; skipped otherwise
  @ValidateIf((o: CreateStudyMaterialDto) => o.source_type === StudyMaterialSource.rich_text)
  @IsString()
  @IsNotEmpty({ message: 'rich_content é obrigatório para source_type rich_text' })
  rich_content?: string;

  @IsDateString()
  publish_at!: string;

  @IsOptional()
  @IsDateString()
  expires_at?: string;

  // Em multipart um campo repetido uma vez só chega como string, não array.
  @Transform(({ value }) => (typeof value === 'string' ? [value] : value))
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @Transform(({ value }) => (typeof value === 'string' ? [value] : value))
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  target_group_ids?: string[];

  // Alcance. Ausente = comportamento antigo: com `target_group_ids`, esses
  // PGs; sem, todos os PGs da congregação.
  @IsOptional()
  @IsEnum(MaterialAudience, { message: 'audience deve ser all_networks, network ou group' })
  audience?: MaterialAudience;

  @ValidateIf((o: CreateStudyMaterialDto) => o.audience === MaterialAudience.network)
  @IsUUID('4', { message: 'network_id é obrigatório para audience network' })
  network_id?: string;

  @IsOptional()
  @IsEnum(MaterialVisibility, { message: 'Visibilidade deve ser all ou leaders_only' })
  visibility?: MaterialVisibility;
}
