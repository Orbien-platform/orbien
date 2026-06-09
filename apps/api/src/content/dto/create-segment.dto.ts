import { IsNotEmpty, IsObject, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SegmentCriteriaDto } from './segment-criteria.dto';

export class CreateSegmentDto {
  @IsString() @IsNotEmpty() name!: string;

  @IsObject() @ValidateNested() @Type(() => SegmentCriteriaDto)
  criteria!: SegmentCriteriaDto;
}
