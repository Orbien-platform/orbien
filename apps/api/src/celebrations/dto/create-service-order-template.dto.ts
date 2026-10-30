import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/** O molde nasce de uma OC já montada: as etapas são copiadas dela. */
export class CreateServiceOrderTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsUUID()
  service_order_id!: string;
}
