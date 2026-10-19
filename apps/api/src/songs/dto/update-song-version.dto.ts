import { PartialType } from '@nestjs/mapped-types';
import { CreateSongVersionDto } from './create-song-version.dto';

export class UpdateSongVersionDto extends PartialType(CreateSongVersionDto) {}
