import { IsDate, IsEnum, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { VisitOrigin } from '@prisma/client';

export class CreateVisitDto {
  @IsUUID('4', { message: 'person_id deve ser um UUID válido' })
  person_id!: string;

  @IsEnum(VisitOrigin, { message: 'Origem de visita inválida' })
  origin!: VisitOrigin;

  // Required only when origin === small_group
  @ValidateIf((o: CreateVisitDto) => o.origin === VisitOrigin.small_group)
  @IsUUID('4', { message: 'small_group_id deve ser um UUID válido' })
  small_group_id?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'visited_at deve ser uma data válida' })
  visited_at?: Date;
}
