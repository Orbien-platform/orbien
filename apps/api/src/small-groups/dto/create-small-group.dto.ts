import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { SmallGroupType } from '@prisma/client';

export class CreateSmallGroupDto {
  @IsString()
  name!: string;

  @IsEnum(SmallGroupType, { message: 'Tipo de grupo inválido' })
  type!: SmallGroupType;

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
