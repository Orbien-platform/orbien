import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const SLOTS = ['morning', 'afternoon', 'evening'] as const;
export type Slot = (typeof SLOTS)[number];
export type DayKey =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday';

export class DayAvailabilityDto {
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
}
