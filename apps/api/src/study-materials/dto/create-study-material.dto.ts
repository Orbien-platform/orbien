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
import { StudyMaterialSource } from '@prisma/client';

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

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  target_group_ids?: string[];
}
