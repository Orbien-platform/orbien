import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min, ValidateIf } from 'class-validator';
import {
  ResponsibleType,
  ServiceOrderEntryKind,
  ServiceOrderItemType,
  ServiceOrderPhase,
} from '@prisma/client';

export class CreateServiceOrderItemDto {
  @IsUUID()
  service_order_id!: string;

  @IsInt()
  @Min(1)
  sequence!: number;

  @IsString()
  name!: string;

  @IsEnum(ServiceOrderItemType)
  type!: ServiceOrderItemType;

  /** Negativo é antes do início do culto. A coerência com `phase` e a duração
   * mínima de cada tipo de etapa são checadas no serviço. */
  @IsInt()
  @Min(-1440)
  @Max(1440)
  start_offset_minutes!: number;

  @IsInt()
  @Min(0)
  duration_minutes!: number;

  @IsOptional()
  @IsEnum(ServiceOrderPhase)
  phase?: ServiceOrderPhase;

  @IsOptional()
  @IsEnum(ServiceOrderEntryKind)
  entry_kind?: ServiceOrderEntryKind;

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
