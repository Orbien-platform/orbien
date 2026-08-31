import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { VisitOrigin } from '@prisma/client';

export class CreateQrTokenDto {
  @IsEnum(VisitOrigin, { message: 'origin inválido' })
  origin!: VisitOrigin;

  @IsOptional()
  @IsUUID('4', { message: 'small_group_id deve ser UUID válido' })
  small_group_id?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
