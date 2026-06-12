import { PartialType } from '@nestjs/mapped-types';
import { CreateCelebrationDto } from './create-celebration.dto';

export class UpdateCelebrationDto extends PartialType(CreateCelebrationDto) {}
