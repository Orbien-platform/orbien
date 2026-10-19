import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Campos de uma versão: tudo que, na música, não é o título. */
export class CreateSongVersionDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label!: string;

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
  @IsUrl()
  youtube_link?: string;

  @IsOptional()
  @IsUrl()
  spotify_link?: string;

  @IsOptional()
  @IsUrl()
  cifra_club_link?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
