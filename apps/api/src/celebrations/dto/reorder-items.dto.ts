import { IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ReorderItemEntryDto {
  @IsUUID()
  id!: string;

  @IsInt()
  @Min(1)
  sequence!: number;
}

export class ReorderItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItemEntryDto)
  items!: ReorderItemEntryDto[];
}
