import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Min, ValidateIf } from 'class-validator';
import { ResponsibleType } from '@prisma/client';

export class CreateServiceOrderItemDto {
  @IsUUID()
  service_order_id!: string;

  @IsInt()
  @Min(1)
  sequence!: number;

  @IsString()
  name!: string;

  @IsInt()
  @Min(0)
  start_offset_minutes!: number;

  @IsInt()
  @Min(1)
  duration_minutes!: number;

  @IsEnum(ResponsibleType)
  responsible_type!: ResponsibleType;

  @ValidateIf((o: CreateServiceOrderItemDto) => o.responsible_type === ResponsibleType.person)
  @IsUUID()
  person_id?: string;

  @ValidateIf((o: CreateServiceOrderItemDto) => o.responsible_type === ResponsibleType.ministry)
  @IsUUID()
  ministry_id?: string;

  @ValidateIf((o: CreateServiceOrderItemDto) => o.responsible_type === ResponsibleType.free_text)
  @IsString()
  responsible_label?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
