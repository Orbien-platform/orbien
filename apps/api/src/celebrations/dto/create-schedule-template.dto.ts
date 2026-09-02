import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ScheduleTemplateMinistryDto {
  @IsUUID()
  ministry_id!: string;

  @IsInt()
  @Min(1)
  slots!: number;
}

export class CreateScheduleTemplateDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ScheduleTemplateMinistryDto)
  ministries!: ScheduleTemplateMinistryDto[];
}
