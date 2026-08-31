import { IsInt, IsOptional, IsString, IsUUID, IsUrl, Min } from 'class-validator';

export class CreateSetlistSongDto {
  @IsUUID()
  setlist_id!: string;

  @IsInt()
  @Min(1)
  sequence!: number;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  key?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  bpm?: number;

  @IsOptional()
  @IsUrl()
  link?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
