import { PartialType } from '@nestjs/mapped-types';
import { CreateVolunteerProfileDto } from './create-volunteer-profile.dto';

export class UpdateVolunteerProfileDto extends PartialType(CreateVolunteerProfileDto) {}
