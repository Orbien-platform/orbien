import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

const SLOTS = ['morning', 'afternoon', 'evening'] as const;
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

type Slot = (typeof SLOTS)[number];
type DayKey = (typeof DAYS)[number];

class DayAvailabilityDto {
  @IsOptional() @IsArray() @IsIn(SLOTS, { each: true }) sunday?: Slot[];
  @IsOptional() @IsArray() @IsIn(SLOTS, { each: true }) monday?: Slot[];
  @IsOptional() @IsArray() @IsIn(SLOTS, { each: true }) tuesday?: Slot[];
  @IsOptional() @IsArray() @IsIn(SLOTS, { each: true }) wednesday?: Slot[];
  @IsOptional() @IsArray() @IsIn(SLOTS, { each: true }) thursday?: Slot[];
  @IsOptional() @IsArray() @IsIn(SLOTS, { each: true }) friday?: Slot[];
  @IsOptional() @IsArray() @IsIn(SLOTS, { each: true }) saturday?: Slot[];
}

export class CreateVolunteerProfileDto {
  @IsUUID('4') person_id!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => DayAvailabilityDto)
  availability!: Partial<Record<DayKey, Slot[]>>;

  @IsOptional() @IsArray() @IsString({ each: true }) skills?: string[];

  @IsOptional() @IsString() restrictions?: string;

  @IsOptional() @IsArray() @IsUUID('4', { each: true }) ministry_ids?: string[];

  @IsOptional() @IsString() role_in_ministry?: string;
}
