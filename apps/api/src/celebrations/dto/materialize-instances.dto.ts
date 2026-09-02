import { IsDateString } from 'class-validator';

export class MaterializeInstancesDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}
