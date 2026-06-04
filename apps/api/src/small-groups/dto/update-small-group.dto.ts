import { PartialType } from '@nestjs/mapped-types';
import { CreateSmallGroupDto } from './create-small-group.dto';

export class UpdateSmallGroupDto extends PartialType(CreateSmallGroupDto) {}
