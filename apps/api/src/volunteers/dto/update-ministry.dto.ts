import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsUUID } from 'class-validator';
import { CreateMinistryDto } from './create-ministry.dto';

export class UpdateMinistryDto extends PartialType(
  OmitType(CreateMinistryDto, ['parent_ministry_id'] as const),
) {
  // Aceita null explicitamente (promove o ministério a raiz), além de uma UUID.
  @IsOptional()
  @IsUUID('4')
  parent_ministry_id?: string | null;
}
