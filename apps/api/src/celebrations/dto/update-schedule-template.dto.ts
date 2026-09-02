import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ScheduleTemplateMinistryDto } from './create-schedule-template.dto';

export class UpdateScheduleTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  /** Quando informada, substitui a lista de ministérios por inteiro. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleTemplateMinistryDto)
  ministries?: ScheduleTemplateMinistryDto[];
}
