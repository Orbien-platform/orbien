import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

export class MultiplySmallGroupDto {
  @IsString()
  name!: string;

  @IsUUID()
  leader_person_id!: string;

  @IsOptional()
  @IsArray()
  @IsUUID(4, { each: true })
  member_ids: string[] = [];

  @IsOptional()
  @IsString()
  meeting_time?: string;

  @IsOptional()
  @IsString()
  recurrence?: string;

  @IsOptional()
  @IsString()
  address?: string;
}
