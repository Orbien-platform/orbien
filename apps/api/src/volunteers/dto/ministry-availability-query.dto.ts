import { IsISO8601 } from 'class-validator';

export class MinistryAvailabilityQueryDto {
  @IsISO8601()
  date!: string;
}
