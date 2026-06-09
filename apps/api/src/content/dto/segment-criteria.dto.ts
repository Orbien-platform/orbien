import {
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AgeRangeDto {
  @IsInt() @Min(0) min!: number;
  @IsInt() @Min(0) max!: number;
}

export class SegmentCriteriaDto {
  @IsOptional() @IsArray() @IsUUID('4', { each: true })
  congregation_ids?: string[];

  @IsOptional() @IsArray() @IsUUID('4', { each: true })
  group_ids?: string[];

  @IsOptional() @IsArray() @IsUUID('4', { each: true })
  ministry_ids?: string[];

  @IsOptional() @ValidateNested() @Type(() => AgeRangeDto)
  age_range?: AgeRangeDto;

  @IsOptional() @IsArray() @IsString({ each: true })
  roles?: string[];
}
