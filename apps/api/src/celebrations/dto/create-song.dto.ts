import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Min } from 'class-validator';

export class CreateSongDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
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
