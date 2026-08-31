import { IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ReorderSongEntryDto {
  @IsUUID()
  id!: string;

  @IsInt()
  @Min(1)
  sequence!: number;
}

export class ReorderSongsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderSongEntryDto)
  songs!: ReorderSongEntryDto[];
}
