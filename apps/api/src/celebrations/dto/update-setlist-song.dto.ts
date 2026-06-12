import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateSetlistSongDto } from './create-setlist-song.dto';

export class UpdateSetlistSongDto extends PartialType(
  OmitType(CreateSetlistSongDto, ['setlist_id'] as const),
) {}
