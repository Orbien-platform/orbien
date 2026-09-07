import { IsInt, IsOptional, IsString, IsUrl, Min } from 'class-validator';

export class CreateSongDto {
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
