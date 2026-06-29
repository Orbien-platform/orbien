import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateSmallGroupDto {
  @IsString()
  name!: string;

  @IsUUID()
  group_type_id!: string;

  @IsOptional()
  @IsUUID()
  parent_group_id?: string;

  @IsUUID()
  leader_person_id!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsString()
  meeting_time?: string;

  @IsOptional()
  @IsString()
  recurrence?: string;

  @IsOptional()
  @IsBoolean()
  is_public?: boolean;

  @IsOptional()
  @IsString()
  public_description?: string;

  @IsOptional()
  @IsString()
  public_photo_url?: string;
}
