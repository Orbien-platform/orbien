import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsUUID } from 'class-validator';
import { CreateSmallGroupDto } from './create-small-group.dto';

export class UpdateSmallGroupDto extends PartialType(CreateSmallGroupDto) {
  // Vínculo/desvínculo de rede (PROD-20, CEL20-07): null desvincula
  // explicitamente, UUID vincula. IsOptional aceita ambos os casos —
  // mesmo padrão de UpdateMinistryDto.parent_ministry_id.
  @IsOptional()
  @IsUUID('4')
  network_id?: string | null;
}
