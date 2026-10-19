import { Transform, Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CreateSongVersionDto } from './create-song-version.dto';

export class CreateSongDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  title!: string;

  /** Versão inicial. Sem ela, a música nasce com uma versão "Original" vazia. */
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateSongVersionDto)
  version?: CreateSongVersionDto;
}
