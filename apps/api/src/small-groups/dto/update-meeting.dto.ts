import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateMeetingDto } from './create-meeting.dto';

export class UpdateMeetingDto extends PartialType(
  OmitType(CreateMeetingDto, ['small_group_id', 'attendee_ids'] as const),
) {}
